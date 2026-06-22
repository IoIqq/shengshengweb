const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { user: userModel, session: sessionModel, audit: auditModel } = require('../models');
const { getSession, requireAuth } = require('../middleware/auth');
const { setSessionCookie, clearSessionCookie, getRequestCookies } = require('../middleware/csrf');
const { logLoginFailure } = require('../utils/logger');

function createLoginSession(req, res, user) {
  const { token, expiresAt } = sessionModel.createSession(user.id);

  userModel.updateLastLogin(user.id);

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

  setSessionCookie(req, res, token, expiresAt);

  res.json({
    success: true,
    authenticated: true,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name || '',
      signature: user.signature || '',
      avatarUrl: user.avatar_url || '',
    }
  });
}

// 登录限流：1分钟内最多5次尝试。
// key 维度同时叠加 IP + 用户名,避免单一 IP 上的不同用户被互相挤掉,
// 也避免攻击者用一个 IP 桶打掉其他用户的合法登录。
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 5,
  message: { error: '登录尝试次数过多，请1分钟后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res, _next, _options) => {
    res.status(429).json({ error: '登录尝试次数过多，请1分钟后再试。' });
  },
});

/**
 * 获取当前会话信息
 */
router.get('/session', (req, res) => {
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

  createLoginSession(req, res, user);
});

/**
 * 访客登录
 */
router.post('/login/guest', loginLimiter, (req, res) => {
  const user = userModel.getUserByUsername(config.GUEST_USERNAME);

  if (!user) {
    return res.status(404).json({ error: '访客账号不存在。' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: '访客账号已被禁用。' });
  }

  if (user.role !== 'guest') {
    return res.status(403).json({ error: '访客账号配置异常。' });
  }

  createLoginSession(req, res, user);
});

/**
 * 用户登出
 */
router.post('/logout', requireAuth, (req, res) => {
  const cookies = getRequestCookies(req);
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
