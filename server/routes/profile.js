const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { user: userModel, profile: profileModel, session: sessionModel, audit: auditModel } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { getRequestCookies } = require('../middleware/csrf');
const config = require('../config');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: '上传过于频繁,请稍后再试。' },
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => res.status(429).json({ error: '修改密码尝试过于频繁,请 5 分钟后再试。' }),
});

const AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) { cb(null, config.AVATAR_DIR); },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `avatar-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!file.mimetype.startsWith('image/') || !AVATAR_EXTENSIONS.has(ext)) {
      const err = new Error('只能上传图片文件（PNG、JPG、WEBP、GIF）。');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

/** 密码强度校验：≥8位，含大写、小写、数字 */
function validatePasswordStrength(password) {
  if (password.length < 8) return '密码长度至少 8 位。';
  if (!/[A-Z]/.test(password)) return '密码需包含至少一个大写字母。';
  if (!/[a-z]/.test(password)) return '密码需包含至少一个小写字母。';
  if (!/[0-9]/.test(password)) return '密码需包含至少一个数字。';
  return null;
}

// GET /api/profile/summary
router.get('/summary', requireAuth, (req, res) => {
  try {
    res.json({ ok: true, summary: profileModel.getProfileSummary(req.user) });
  } catch {
    res.status(500).json({ error: '获取个人概要失败。' });
  }
});

// GET /api/profile/sessions — 列出当前用户的有效会话
router.get('/sessions', requireAuth, (req, res) => {
  try {
    const cookies = getRequestCookies(req);
    const currentToken = cookies[config.SESSION_COOKIE] || '';
    const sessions = sessionModel.listUserSessions(req.user.id).map(s => ({
      id: s.token.slice(0, 8),           // 只暴露前8位，不能用于认证
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      ipAddress: s.ip_address || '',
      userAgent: s.user_agent || '',
      isCurrent: s.token === currentToken,
    }));
    res.json({ ok: true, sessions });
  } catch {
    res.status(500).json({ error: '获取会话列表失败。' });
  }
});

// DELETE /api/profile/sessions/others — 退出其他所有设备
router.delete('/sessions/others', requireAuth, (req, res) => {
  try {
    const cookies = getRequestCookies(req);
    const currentToken = cookies[config.SESSION_COOKIE] || '';
    sessionModel.deleteUserOtherSessions(req.user.id, currentToken);
    auditModel.createAuditLog({
      userId: req.user.id, username: req.user.username, role: req.user.role,
      action: 'revoke_other_sessions', resourceType: 'session',
      ipAddress: req.ip, userAgent: req.get('user-agent'),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: '操作失败。' });
  }
});

// PATCH /api/profile
router.patch('/', requireAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: '请先登录。' });
    const body = req.body || {};
    const updates = {};
    if (body.displayName !== undefined) updates.display_name = String(body.displayName || '').trim();
    if (body.signature  !== undefined) updates.signature    = String(body.signature  || '').trim();
    if (body.phone      !== undefined) updates.phone        = String(body.phone      || '').trim();
    if (body.bio        !== undefined) updates.bio          = String(body.bio        || '').trim();
    if (body.navMode    !== undefined) {
      const m = String(body.navMode).trim();
      if (['auto', 'locked'].includes(m)) updates.nav_mode = m;
    }
    const u = userModel.updateUserProfile(userId, updates);
    res.json({ ok: true, user: {
      id: u.id, username: u.username, role: u.role,
      displayName: u.display_name || '', signature: u.signature || '',
      phone: u.phone || '', bio: u.bio || '', avatarUrl: u.avatar_url || '',
      navMode: u.nav_mode || 'auto',
    }});
  } catch {
    res.status(500).json({ error: '更新个人信息失败。' });
  }
});

// POST /api/profile/password
router.post('/password', passwordChangeLimiter, requireAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: '请先登录。' });
    const { oldPassword = '', newPassword = '' } = req.body || {};
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入原密码和新密码。' });
    const strengthErr = validatePasswordStrength(newPassword);
    if (strengthErr) return res.status(400).json({ error: strengthErr });
    userModel.changePassword(userId, oldPassword, newPassword);
    // 修改密码后踢出其他设备
    const currentToken = getRequestCookies(req)[config.SESSION_COOKIE] || '';
    sessionModel.deleteUserOtherSessions(userId, currentToken);
    auditModel.createAuditLog({
      userId, username: req.user.username, role: req.user.role,
      action: 'change_password', resourceType: 'user', resourceId: String(userId),
      ipAddress: req.ip, userAgent: req.get('user-agent'),
    });
    res.json({ ok: true, message: '密码修改成功，其他设备已退出。' });
  } catch (error) {
    if (error.message.includes('不正确') || error.message.includes('不存在')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: '修改密码失败。' });
  }
});

// POST /api/profile/avatar
router.post('/avatar', uploadLimiter, requireAuth, avatarUpload.single('avatar'), (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: '请先登录。' });
    if (!req.file) return res.status(400).json({ error: '请选择要上传的头像文件。' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const u = userModel.updateAvatar(userId, avatarUrl);
    res.json({ ok: true, avatarUrl, user: {
      id: u.id, username: u.username, role: u.role,
      displayName: u.display_name || '', signature: u.signature || '', avatarUrl: u.avatar_url || '',
    }});
  } catch {
    res.status(500).json({ error: '上传头像失败。' });
  }
});

// DELETE /api/profile/avatar — 清除头像
router.delete('/avatar', requireAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: '请先登录。' });
    const u = userModel.updateAvatar(userId, '');
    res.json({ ok: true, user: {
      id: u.id, username: u.username, role: u.role,
      displayName: u.display_name || '', signature: u.signature || '', avatarUrl: '',
    }});
  } catch {
    res.status(500).json({ error: '清除头像失败。' });
  }
});

module.exports = router;
