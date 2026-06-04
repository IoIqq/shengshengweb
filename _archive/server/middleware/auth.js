const crypto = require('crypto');
const { get, runWrite, persistDb } = require('../database');
const { nowIso } = require('../utils/helpers');
const { logAuthFailure } = require('../utils/logger');

let SESSION_TTL_HOURS = 72;
let SESSION_COOKIE = 'ss_sid';
let CSRF_COOKIE = 'ss_csrf';
let CSRF_HEADER = 'x-csrf-token';
let CSRF_SECRET = '';
let CSRF_SAFE_METHODS = new Set();
let CSRF_EXEMPT_PATHS = new Set();

function initAuth(config) {
  SESSION_TTL_HOURS = config.SESSION_TTL_HOURS;
  SESSION_COOKIE = config.SESSION_COOKIE;
  CSRF_COOKIE = config.CSRF_COOKIE;
  CSRF_HEADER = config.CSRF_HEADER;
  CSRF_SECRET = config.CSRF_SECRET;
  CSRF_SAFE_METHODS = config.CSRF_SAFE_METHODS;
  CSRF_EXEMPT_PATHS = config.CSRF_EXEMPT_PATHS;
}

function cleanupSessions() {
  runWrite('DELETE FROM sessions WHERE expires_at <= ?', [nowIso()]);
}

function createSession(userId) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  runWrite(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, expiresAt, nowIso()],
  );
  persistDb();
  return { token, expiresAt };
}

function destroySession(token) {
  if (!token) return;
  runWrite('DELETE FROM sessions WHERE token = ?', [token]);
  persistDb();
}

function parseCookies(header) {
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function cleanupExpiredSessionState() {
  cleanupSessions();
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  cleanupExpiredSessionState();
  const row = get(
    `SELECT sessions.token, sessions.expires_at, users.id AS user_id, users.username, users.role,
            users.display_name, users.signature, users.avatar_url
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`,
    [token, nowIso()],
  );
  if (!row) return null;
  return {
    token: row.token,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
      displayName: row.display_name || '',
      signature: row.signature || '',
      avatarUrl: row.avatar_url || '',
    },
  };
}

function shouldUseSecureCookie(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').toLowerCase();
  return forwardedProto.split(',')[0].trim() === 'https';
}

function setSessionCookie(req, res, token, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const secureFlag = shouldUseSecureCookie(req);
  const sessionParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secureFlag) sessionParts.push('Secure');

  // CSRF token 与 session 1:1 关联：用 session token 派生（HMAC 防伪）
  const csrfToken = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(token)
    .digest('hex');
  const csrfParts = [
    `${CSRF_COOKIE}=${csrfToken}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secureFlag) csrfParts.push('Secure');

  res.setHeader('Set-Cookie', [sessionParts.join('; '), csrfParts.join('; ')]);
}

function clearSessionCookie(req, res) {
  const secureFlag = shouldUseSecureCookie(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`,
  ]);
}

function csrfProtect(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
  if (!req.path.startsWith('/api/')) return next();

  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies[SESSION_COOKIE];
  const cookieCsrf = cookies[CSRF_COOKIE];
  const headerCsrf = req.get(CSRF_HEADER);

  if (!sessionToken || !cookieCsrf || !headerCsrf) {
    return res.status(403).json({ error: 'CSRF 校验失败：缺少 token。' });
  }
  // cookieCsrf 必须等于 HMAC(sessionToken)，防伪造
  const expected = crypto.createHmac('sha256', CSRF_SECRET).update(sessionToken).digest('hex');
  const cookieOk = cookieCsrf.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(cookieCsrf), Buffer.from(expected));
  const headerOk = headerCsrf.length === cookieCsrf.length
    && crypto.timingSafeEqual(Buffer.from(headerCsrf), Buffer.from(cookieCsrf));
  if (!cookieOk || !headerOk) {
    return res.status(403).json({ error: 'CSRF 校验失败。' });
  }
  next();
}

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

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    logAuthFailure(req, 'forbidden', { requiredRole: 'admin' });
    return res.status(403).json({ error: '权限不足。' });
  }
  next();
}

function requireAuthForUploads(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).send('请先登录后访问素材文件。');
  }
  req.session = session;
  req.user = session.user;
  next();
}

function sessionToPayload(session) {
  if (!session) {
    return { authenticated: false, user: null };
  }
  return {
    authenticated: true,
    user: session.user,
    expiresAt: session.expiresAt,
  };
}

module.exports = {
  initAuth,
  createSession,
  destroySession,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  csrfProtect,
  requireAuth,
  requireAdmin,
  requireAuthForUploads,
  sessionToPayload,
};
