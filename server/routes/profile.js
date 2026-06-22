const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { user: userModel, profile: profileModel } = require('../models');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');

// Rate limiter for uploads
const rateLimit = require('express-rate-limit');
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '上传过于频繁,请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// 修改密码的速率限制:5 分钟内最多 5 次尝试,降低爆破与撞库风险。
const passwordChangeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 分钟
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res, _next, _options) => {
    res.status(429).json({ error: '修改密码尝试过于频繁,请 5 分钟后再试。' });
  },
});

// Multer configuration for avatar upload
const AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_AVATAR_MB = 5;

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.AVATAR_DIR);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      cb(null, `avatar-${timestamp}-${random}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_AVATAR_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/');

    if (!isImage || !AVATAR_EXTENSIONS.has(ext)) {
      const error = new Error('只能上传图片文件（PNG、JPG、WEBP、GIF）。');
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

// GET /api/profile/summary - Profile activity summary
router.get('/summary', requireAuth, (req, res) => {
  try {
    const summary = profileModel.getProfileSummary(req.user);
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ error: '获取个人概要失败。' });
  }
});

// PATCH /api/profile - Update user profile
router.patch('/', requireAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '请先登录。' });
    }

    const body = req.body || {};
    const updates = {};

    if (body.displayName !== undefined) {
      updates.display_name = String(body.displayName || '').trim();
    }
    if (body.signature !== undefined) {
      updates.signature = String(body.signature || '').trim();
    }
    if (body.phone !== undefined) {
      updates.phone = String(body.phone || '').trim();
    }
    if (body.bio !== undefined) {
      updates.bio = String(body.bio || '').trim();
    }

    const updatedUser = userModel.updateUserProfile(userId, updates);

    res.json({
      ok: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        displayName: updatedUser.display_name || '',
        signature: updatedUser.signature || '',
        phone: updatedUser.phone || '',
        bio: updatedUser.bio || '',
        avatarUrl: updatedUser.avatar_url || '',
      },
    });
  } catch (error) {
    res.status(500).json({ error: '更新个人信息失败。' });
  }
});

// POST /api/profile/password - Change password
router.post('/password', passwordChangeLimiter, requireAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '请先登录。' });
    }

    const body = req.body || {};
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入原密码和新密码。' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位。' });
    }

    userModel.changePassword(userId, oldPassword, newPassword);

    res.json({ ok: true, message: '密码修改成功。' });
  } catch (error) {
    if (error.message.includes('不正确') || error.message.includes('不存在')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: '修改密码失败。' });
  }
});

// POST /api/profile/avatar - Upload avatar
router.post('/avatar', uploadLimiter, requireAuth, avatarUpload.single('avatar'), (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '请先登录。' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的头像文件。' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const updatedUser = userModel.updateAvatar(userId, avatarUrl);

    res.json({
      ok: true,
      avatarUrl,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        displayName: updatedUser.display_name || '',
        signature: updatedUser.signature || '',
        avatarUrl: updatedUser.avatar_url || '',
      },
    });
  } catch (error) {
    res.status(500).json({ error: '上传头像失败。' });
  }
});

module.exports = router;
