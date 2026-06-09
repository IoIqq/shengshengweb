const crypto = require('crypto');
const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

/**
 * 生成密码哈希
 */
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

/**
 * 创建用户
 */
function createUser(username, password, role = 'editor', createdBy = null) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const now = nowIso();

  run(
    `INSERT INTO users (username, password_hash, salt, role, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, passwordHash, salt, role, now, now, createdBy]
  );
  saveDatabase();

  return get('SELECT * FROM users WHERE username = ?', [username]);
}

function ensureUserExists(username, password, role = 'editor', createdBy = null) {
  const existing = getUserByUsername(username);
  if (existing) return existing;
  return createUser(username, password, role, createdBy);
}

/**
 * 验证用户密码
 */
function verifyUser(username, password) {
  const user = get('SELECT * FROM users WHERE username = ? AND status = "active"', [username]);
  if (!user) return null;

  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) return null;

  return user;
}

/**
 * 获取所有用户
 */
function getAllUsers() {
  return all('SELECT id, username, role, display_name, signature, avatar_url, status, last_login_at, created_at, updated_at FROM users ORDER BY created_at DESC');
}

/**
 * 根据ID获取用户
 */
function getUserById(id) {
  return get('SELECT id, username, role, display_name, signature, avatar_url, status, last_login_at, created_at, updated_at FROM users WHERE id = ?', [id]);
}

/**
 * 根据用户名获取用户
 */
function getUserByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', [username]);
}

/**
 * 更新用户信息
 */
function updateUser(id, updates) {
  const now = nowIso();
  const fields = [];
  const values = [];

  if (updates.display_name !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.display_name);
  }
  if (updates.signature !== undefined) {
    fields.push('signature = ?');
    values.push(updates.signature);
  }
  if (updates.avatar_url !== undefined) {
    fields.push('avatar_url = ?');
    values.push(updates.avatar_url);
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(updates.password, salt);
    fields.push('password_hash = ?, salt = ?');
    values.push(passwordHash, salt);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getUserById(id);
}

/**
 * 更新用户最后登录时间
 */
function updateLastLogin(userId) {
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), userId]);
  saveDatabase();
}

/**
 * 删除用户
 */
function deleteUser(id) {
  run('DELETE FROM users WHERE id = ?', [id]);
  saveDatabase();
}

/**
 * 检查用户名是否存在
 */
function usernameExists(username, excludeId = null) {
  if (excludeId) {
    return !!get('SELECT id FROM users WHERE username = ? AND id != ?', [username, excludeId]);
  }
  return !!get('SELECT id FROM users WHERE username = ?', [username]);
}

/**
 * 更新用户个人资料
 */
function updateUserProfile(userId, updates) {
  const now = nowIso();
  const fields = [];
  const values = [];

  if (updates.display_name !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.display_name);
  }
  if (updates.signature !== undefined) {
    fields.push('signature = ?');
    values.push(updates.signature);
  }
  if (updates.phone !== undefined) {
    fields.push('phone = ?');
    values.push(updates.phone);
  }
  if (updates.bio !== undefined) {
    fields.push('bio = ?');
    values.push(updates.bio);
  }

  if (fields.length === 0) {
    return getUserById(userId);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(userId);

  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getUserById(userId);
}

/**
 * 修改用户密码
 */
function changePassword(userId, oldPassword, newPassword) {
  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('用户不存在。');
  }

  // 验证旧密码
  const oldHash = hashPassword(oldPassword, user.salt);
  if (oldHash !== user.password_hash) {
    throw new Error('原密码不正确。');
  }

  // 生成新密码哈希
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);

  run(
    'UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?',
    [newHash, newSalt, nowIso(), userId]
  );
  saveDatabase();

  return true;
}

/**
 * 更新用户头像
 */
function updateAvatar(userId, avatarUrl) {
  run('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', [avatarUrl, nowIso(), userId]);
  saveDatabase();
  return getUserById(userId);
}

function hasOtherActiveAdmin(id) {
  const row = get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != ?", [id]);
  return Number(row?.count || 0) > 0;
}

module.exports = {
  createUser,
  ensureUserExists,
  verifyUser,
  getAllUsers,
  getUserById,
  getUserByUsername,
  updateUser,
  updateLastLogin,
  deleteUser,
  usernameExists,
  hashPassword,
  updateUserProfile,
  changePassword,
  updateAvatar,
  hasOtherActiveAdmin,
};
