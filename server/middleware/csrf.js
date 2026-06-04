const crypto = require('crypto');
const config = require('../config');
const { logAuthFailure } = require('../utils/logger');

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/login',
  '/api/client-log',
]);

/**
 * 解析Cookie字符串
 */
function parseCookies(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach((pair) => {
    const [key, ...rest] = pair.split('=');
    if (key && rest.length > 0) {
      cookies[key.trim()] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

/**
 * 检查是否应使用安全Cookie
 */
function shouldUseSecureCookie(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').toLowerCase();
  return forwardedProto.split(',')[0].trim() === 'https';
}

/**
 * 设置会话Cookie
 */
function setSessionCookie(req, res, token, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const secureFlag = shouldUseSecureCookie(req);
  const sessionParts = [
    `${config.SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secureFlag) sessionParts.push('Secure');

  // CSRF token 与 session 1:1 关联：用 session token 派生（HMAC 防伪）
  const csrfToken = crypto
    .createHmac('sha256', config.CSRF_SECRET)
    .update(token)
    .digest('hex');
  const csrfParts = [
    `${config.CSRF_COOKIE}=${csrfToken}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secureFlag) csrfParts.push('Secure');

  res.setHeader('Set-Cookie', [sessionParts.join('; '), csrfParts.join('; ')]);
}

/**
 * 清除会话Cookie
 */
function clearSessionCookie(req, res) {
  const secureFlag = shouldUseSecureCookie(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${config.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
    `${config.CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`,
  ]);
}

/**
 * CSRF保护中间件
 */
function csrfProtect(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
  if (!req.path.startsWith('/api/')) return next();

  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies[config.SESSION_COOKIE];
  const cookieCsrf = cookies[config.CSRF_COOKIE];
  const headerCsrf = req.get(config.CSRF_HEADER);

  if (!sessionToken || !cookieCsrf || !headerCsrf) {
    return res.status(403).json({ error: 'CSRF 校验失败：缺少 token。' });
  }

  // cookieCsrf 必须等于 HMAC(sessionToken)，防伪造
  const expected = crypto.createHmac('sha256', config.CSRF_SECRET).update(sessionToken).digest('hex');
  const cookieOk = cookieCsrf.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(cookieCsrf), Buffer.from(expected));
  const headerOk = headerCsrf.length === cookieCsrf.length
    && crypto.timingSafeEqual(Buffer.from(headerCsrf), Buffer.from(cookieCsrf));

  if (!cookieOk || !headerOk) {
    return res.status(403).json({ error: 'CSRF 校验失败。' });
  }
  next();
}

module.exports = {
  parseCookies,
  shouldUseSecureCookie,
  setSessionCookie,
  clearSessionCookie,
  csrfProtect
};
