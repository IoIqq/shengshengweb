const config = require('../config');
const { hasPermission } = require('../config/permissions');
const { getRequestCookies } = require('./csrf');
const { logAuthFailure } = require('../utils/logger');

/**
 * 从请求中获取会话（需要在使用前设置getSessionFromDb函数）
 */
let getSessionFromDb = null;

function setSessionGetter(getter) {
  getSessionFromDb = getter;
}

function getSession(req) {
  if (!getSessionFromDb) {
    throw new Error('Session getter not configured. Call setSessionGetter() first.');
  }
  if (req._sessionLoaded) return req._cachedSession;

  const cookies = getRequestCookies(req);
  const token = cookies[config.SESSION_COOKIE];
  req._sessionLoaded = true;
  req._cachedSession = token ? getSessionFromDb(token) : null;
  return req._cachedSession;
}

/**
 * 要求用户已登录
 */
function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    logAuthFailure(req, 'unauthorized');
    return res.status(401).json({ error: '请先登录。' });
  }
  req.session = session;
  req.user = session.user;
  next();
}

/**
 * 要求用户有指定权限
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录。' });
    }
    if (!hasPermission(req.user.role, permission)) {
      logAuthFailure(req, 'forbidden', { requiredPermission: permission });
      return res.status(403).json({ error: '权限不足。' });
    }
    next();
  };
}

/**
 * 要求用户是编辑或管理员
 */
function requireEditor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录。' });
  }
  if (!['admin', 'editor'].includes(req.user.role)) {
    logAuthFailure(req, 'forbidden', { requiredRole: 'editor' });
    return res.status(403).json({ error: '权限不足。' });
  }
  next();
}

/**
 * 要求用户是管理员
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录。' });
  }
  if (req.user.role !== 'admin') {
    logAuthFailure(req, 'forbidden', { requiredRole: 'admin' });
    return res.status(403).json({ error: '需要管理员权限。' });
  }
  next();
}

/**
 * 上传文件时需要认证
 */
function requireAuthForUploads(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: '请先登录后再上传。' });
  }
  req.session = session;
  req.user = session.user;
  next();
}

module.exports = {
  setSessionGetter,
  getSession,
  requireAuth,
  requirePermission,
  requireEditor,
  requireAdmin,
  requireAuthForUploads
};
