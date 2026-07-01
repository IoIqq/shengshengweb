const crypto = require('crypto');
const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');
const config = require('../config');

function createSession(userId, ipAddress = '', userAgent = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const now = nowIso();
  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    [token, userId, expiresAt, now, ipAddress, userAgent]
  );
  saveDatabase();
  return { token, expiresAt };
}

function getSession(token) {
  const row = get(`
    SELECT s.token, s.expires_at, s.user_id,
           u.username, u.role, u.display_name, u.signature, u.avatar_url, u.phone, u.bio, u.nav_mode
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'
  `, [token, nowIso()]);
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
      phone: row.phone || '',
      bio: row.bio || '',
      navMode: row.nav_mode || 'auto',
    },
  };
}

function deleteSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDatabase();
}

function cleanupExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
  saveDatabase();
}

function deleteUserSessions(userId) {
  run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  saveDatabase();
}

/** 删除某用户除当前 token 外的所有会话（自助改密后踢出其他设备） */
function deleteUserOtherSessions(userId, currentToken) {
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [userId, currentToken]);
  saveDatabase();
}

/** 列出某用户的所有有效会话（用于会话管理 UI） */
function listUserSessions(userId) {
  return all(
    `SELECT token, created_at, expires_at, ip_address, user_agent
     FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`,
    [userId, nowIso()]
  );
}

/** 列出所有用户的有效会话（用于 LAN 客户端 / 在线用户总览） */
function listAllActiveSessions() {
  return all(
    `SELECT s.token, s.created_at, s.expires_at, s.ip_address, s.user_agent,
            u.id AS user_id, u.username, u.role, u.display_name, u.avatar_url, u.status
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.expires_at > ?
     ORDER BY s.created_at DESC`,
    [nowIso()]
  );
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
  deleteUserSessions,
  deleteUserOtherSessions,
  listUserSessions,
  listAllActiveSessions,
};
