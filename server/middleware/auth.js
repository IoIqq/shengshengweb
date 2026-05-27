const crypto = require("crypto");
const { nowIso, parseCookies, shouldUseSecureCookie } = require("../utils/helpers");
const { logAuthFailure } = require("../utils/logger");
const db = require("../database/db");

const SESSION_COOKIE = "ss_sid";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 72);

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, row) {
  if (!row) return false;
  const hash = crypto.scryptSync(String(password), row.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.password_hash, "hex"));
}

function cleanupSessions() {
  db.runWrite("DELETE FROM sessions WHERE expires_at <= ?", [nowIso()]);
}

function createSession(userId) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  db.runWrite(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, expiresAt, nowIso()],
  );
  db.persistDb();
  return { token, expiresAt };
}

function destroySession(token) {
  if (!token) return;
  db.runWrite("DELETE FROM sessions WHERE token = ?", [token]);
  db.persistDb();
}

function cleanupExpiredSessionState() {
  cleanupSessions();
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  cleanupExpiredSessionState();
  const row = db.get(
    `SELECT sessions.token, sessions.expires_at, users.id AS user_id, users.username, users.role
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
    },
  };
}

function setSessionCookie(req, res, token, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  const secureFlag = shouldUseSecureCookie(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
  );
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    logAuthFailure(req, "unauthorized");
    return res.status(401).json({ error: "请先登录。" });
  }
  req.session = session;
  req.user = session.user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    logAuthFailure(req, "forbidden", { requiredRole: "admin" });
    return res.status(403).json({ error: "权限不足。" });
  }
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
  createPasswordHash,
  verifyPassword,
  createSession,
  destroySession,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  sessionToPayload,
};
