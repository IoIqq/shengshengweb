const crypto = require('crypto');
const config = require('../config');
const { logAuthFailure } = require('../utils/logger');

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/login',
  '/api/login/guest',
  '/api/auth/login',
  '/api/auth/login/guest',
  '/api/registration-requests',
  '/api/client-log',
]);

function normalizePath(path) {
  const normalized = String(path || '').split('?')[0].replace(/\/+/g, '/');
  if (!normalized || normalized === '/') return '/';
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function baseRequestPathCandidates(req) {
  return [
    normalizePath(req.path),
    normalizePath(req.originalUrl),
    normalizePath(`${req.baseUrl || ''}${req.path || ''}`),
  ];
}

function requestPathCandidates(req) {
  const candidates = new Set(baseRequestPathCandidates(req));

  for (const path of [...candidates]) {
    if (path.startsWith('/api/')) {
      candidates.add(normalizePath(path.slice(4) || '/'));
    } else {
      candidates.add(normalizePath(`/api${path.startsWith('/') ? path : `/${path}`}`));
    }
  }

  return [...candidates];
}

function isCsrfExempt(req) {
  return requestPathCandidates(req).some((path) => CSRF_EXEMPT_PATHS.has(path));
}

function isApiRequest(req) {
  return baseRequestPathCandidates(req).some((path) => path.startsWith('/api/'));
}

function parseCookieHeader(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return;
    const key = pair.slice(0, index).trim();
    if (key) cookies[key] = decodeURIComponent(pair.slice(index + 1).trim());
  });
  return cookies;
}

/**
 * 解析Cookie字符串
 */
function parseCookies(cookieStr) {
  return parseCookieHeader(cookieStr);
}

function getRequestCookies(req) {
  if (!req._parsedCookies) {
    req._parsedCookies = parseCookieHeader(req.headers.cookie || '');
  }
  return req._parsedCookies;
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
  if (isCsrfExempt(req)) return next();
  if (!isApiRequest(req)) return next();

  const cookies = getRequestCookies(req);
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
  getRequestCookies,
  shouldUseSecureCookie,
  setSessionCookie,
  clearSessionCookie,
  csrfProtect
};
