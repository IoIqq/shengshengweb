const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction } = require('../database');

// 导入中间件
const {
  requireAuth,
  getSession,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  sessionToPayload
} = require('../middleware/auth');
const { loginLimiter, uploadLimiter } = require('../middleware/rateLimiter');

// 导入工具函数
const { verifyPassword, createPasswordHash } = require('../utils/crypto');
const { nowIso, randomId } = require('../utils/helpers');
const { logServerEvent, logLoginFailure } = require('../utils/logger');

// 导入配置
const config = require('../config');

// 辅助函数
function logActivity(title, meta, detail) {
  runWrite(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomId('act'), title, meta, detail, nowIso()],
  );
}

// 头像上传配置
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.AVATAR_DIR);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${randomId('avatar')}${ext}`);
    },
  }),
  limits: {
    fileSize: config.MAX_AVATAR_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/');
    if (isImage && config.AVATAR_EXTENSIONS.has(ext)) {
      return cb(null, true);
    }
    const error = new Error('仅支持图片文件（PNG/JPG/WEBP/GIF）。');
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    cb(error);
  },
});

// ========== 认证路由 ==========

// 获取当前会话
router.get('/session', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({ authenticated: false, user: null });
  }
  req.session = session;
  req.user = session.user;
  res.json(sessionToPayload(session));
});

// 登录
router.post('/login', loginLimiter, (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) {
    logLoginFailure(req, username || '');
    return res.status(400).json({ error: '请输入用户名和密码。' });
  }

  const userRow = get('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  if (!userRow || !verifyPassword(password, userRow)) {
    logLoginFailure(req, username);
    return res.status(401).json({ error: '用户名或密码不正确。' });
  }

  const session = createSession(userRow.id);
  setSessionCookie(req, res, session.token, session.expiresAt);
  const payload = {
    authenticated: true,
    user: {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      displayName: userRow.display_name || '',
      signature: userRow.signature || '',
      avatarUrl: userRow.avatar_url || '',
    },
    expiresAt: session.expiresAt,
  };
  logServerEvent('info', 'login_success', {
    method: req.method,
    path: req.originalUrl || req.url,
    username: userRow.username,
    role: userRow.role,
    ip: req.ip,
  });
  res.json(payload);
});

// 登出
router.post('/logout', (req, res) => {
  const session = getSession(req);
  if (session) {
    destroySession(session.token);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// 更新个人资料
router.patch('/profile', requireAuth, (req, res) => {
  const body = req.body || {};
  const displayName = String(body.displayName || '').trim().slice(0, 50);
  const signature = String(body.signature || '').trim().slice(0, 120);

  transaction(() => {
    runWrite('UPDATE users SET display_name = ?, signature = ?, updated_at = ? WHERE id = ?', [
      displayName,
      signature,
      nowIso(),
      req.user.id,
    ]);
    logActivity('账户资料更新', req.user.username, '更新了显示名称或个人签名。');
  });

  res.json({ ok: true, user: { displayName, signature } });
});

// 修改密码
router.post('/profile/password', requireAuth, (req, res) => {
  const body = req.body || {};
  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入当前密码和新密码。' });
  }
  if (newPassword.length < 6 || newPassword.length > 100) {
    return res.status(400).json({ error: '新密码长度需为 6-100 个字符。' });
  }

  const row = get('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!row || !verifyPassword(oldPassword, row)) {
    return res.status(400).json({ error: '当前密码不正确。' });
  }

  transaction(() => {
    const { salt, hash } = createPasswordHash(newPassword);
    runWrite('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', [
      hash,
      salt,
      nowIso(),
      req.user.id,
    ]);
    logActivity('登录密码修改', req.user.username, '修改了登录密码。');
  });

  res.json({ ok: true });
});

// 上传头像
router.post('/profile/avatar', uploadLimiter, requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请先选择头像图片。' });
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  const previous = get('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [req.user.id]);

  transaction(() => {
    runWrite('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', [
      avatarUrl,
      nowIso(),
      req.user.id,
    ]);
    logActivity('头像更新', req.user.username, '上传了新的头像。');
  });

  if (previous?.avatar_url && previous.avatar_url.startsWith('/uploads/avatars/')) {
    const oldPath = path.join(config.AVATAR_DIR, path.basename(previous.avatar_url));
    fs.unlink(oldPath, () => {});
  }

  res.json({ ok: true, avatarUrl });
});

module.exports = router;
