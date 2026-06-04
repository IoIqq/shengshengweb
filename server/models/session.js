const crypto = require('crypto');
const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');
const config = require('../config');

/**
 * 创建会话
 */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const now = nowIso();

  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [token, userId, expiresAt, now]
  );
  saveDatabase();

  return { token, expiresAt };
}

/**
 * 获取会话（包含用户信息）
 */
function getSession(token) {
  const sql = `
    SELECT s.token, s.expires_at, s.user_id,
           u.username, u.role, u.display_name, u.signature, u.avatar_url, u.phone, u.bio
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'
  `;

  const row = get(sql, [token, nowIso()]);
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
    },
  };
}

/**
 * 删除会话（登出）
 */
function deleteSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDatabase();
}

/**
 * 清理过期会话
 */
function cleanupExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
  saveDatabase();
}

/**
 * 删除用户的所有会话
 */
function deleteUserSessions(userId) {
  run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  saveDatabase();
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
  deleteUserSessions
};
