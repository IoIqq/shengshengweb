const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { user: userModel, session: sessionModel, audit: auditModel } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { setSessionCookie, clearSessionCookie } = require('../middleware/csrf');
const { logLoginFailure } = require('../utils/logger');

// 登录限流：1分钟内最多5次尝试
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 5,
  message: { error: '登录尝试次数过多，请1分钟后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 获取当前会话信息
 */
router.get('/session', (req, res) => {
  const { getSession } = require('../middleware/auth');
  const session = getSession(req);
  if (!session) {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, user: session.user });
});

/**
 * 用户登录
 */
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空。' });
  }

  const user = userModel.verifyUser(username, password);

  if (!user) {
    logLoginFailure(req, username);
    return res.status(401).json({ error: '用户名或密码错误。' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: '账号已被禁用。' });
  }

  // 创建会话
  const { token, expiresAt } = sessionModel.createSession(user.id);

  // 更新最后登录时间
  userModel.updateLastLogin(user.id);

  // 记录审计日志
  auditModel.createAuditLog({
    userId: user.id,
    username: user.username,
    role: user.role,
    action: 'login',
    resourceType: 'session',
    resourceId: token,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // 设置Cookie
  setSessionCookie(req, res, token, expiresAt);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name || '',
      signature: user.signature || '',
      avatarUrl: user.avatar_url || '',
    }
  });
});

/**
 * 用户登出
 */
router.post('/logout', requireAuth, (req, res) => {
  const { parseCookies } = require('../middleware/csrf');
  const config = require('../config');

  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[config.SESSION_COOKIE];

  if (token) {
    sessionModel.deleteSession(token);

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'logout',
      resourceType: 'session',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  clearSessionCookie(req, res);
  res.json({ success: true });
});

module.exports = router;
