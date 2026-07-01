const crypto = require('crypto');
const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

// 列清单常量，杜绝 SELECT * 把 password_hash / salt 等敏感字段泄漏到不该出现的地方
// 按 database.js CREATE TABLE + 迁移列对齐，新增列时同步更新这里
const USER_FULL_COLUMNS =
  'id, username, password_hash, salt, role, status, display_name, signature, avatar_url, phone, bio, last_login_at, created_at, updated_at, created_by';
const USER_PUBLIC_COLUMNS =
  'id, username, role, display_name, signature, avatar_url, status, last_login_at, nav_mode, created_at, updated_at';

// ============================================================================
// 密码哈希
// ----------------------------------------------------------------------------
// 旧实现：pbkdf2Sync(password, salt, 10000, 64, 'sha512') 仅存 hex hash，迭代
// 次数过低（OWASP 2023 推荐 PBKDF2-SHA512 ≥ 600000 次）。
//
// 新格式（可识别、可升级）：
//   pbkdf2$<iterations>$<digest>$<saltHex>$<hashHex>
//
// 兼容性：verifyPassword 同时识别"旧裸 hex 哈希"（视为 10000/sha512/16字节盐）。
// 登录成功后由 verifyUser 透明 rehash 为新格式，老用户无感升级。
// ============================================================================
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_KEYLEN = 64;
const PBKDF2_SALT_BYTES = 16;
const LEGACY_ITERATIONS = 10000; // 仅用于识别/验证旧库数据

/**
 * 生成密码哈希（新格式：pbkdf2$<iterations>$<digest>$<saltHex>$<hashHex>）
 * @param {string} password 明文密码
 * @param {string|Buffer} salt 十六进制盐字符串或 Buffer；新格式盐已内嵌
 */
function hashPassword(password, salt) {
  const saltBytes = typeof salt === 'string' && /^[0-9a-f]+$/i.test(salt)
    ? Buffer.from(salt, 'hex')
    : (Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt || '')));
  const hash = crypto.pbkdf2Sync(password, saltBytes, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  const saltHex = saltBytes.toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${PBKDF2_DIGEST}$${saltHex}$${hash.toString('hex')}`;
}

/**
 * 验证密码
 * @param {string} password 用户输入
 * @param {string} stored 库中存储的哈希（可能是新格式或旧裸 hex）
 * @param {string} salt 旧数据携带的独立 salt 列；新格式自带 salt，此参数被忽略
 * @returns {{ ok: boolean, needsRehash: boolean }}
 */
function verifyPassword(password, stored, salt) {
  if (typeof stored !== 'string' || !stored) return { ok: false, needsRehash: false };

  // 新格式
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    // ['pbkdf2', iterations, digest, saltHex, hashHex]
    if (parts.length !== 5) return { ok: false, needsRehash: false };
    const iterations = Number(parts[1]);
    const digest = parts[2];
    const saltHex = parts[3];
    const expectedHex = parts[4];
    if (!Number.isFinite(iterations) || iterations < 1000) {
      return { ok: false, needsRehash: false };
    }
    const candidate = crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), iterations, PBKDF2_KEYLEN, digest);
    const expected = Buffer.from(expectedHex, 'hex');
    if (candidate.length !== expected.length) return { ok: false, needsRehash: false };
    const ok = crypto.timingSafeEqual(candidate, expected);
    // 迭代次数低于当前推荐 → 标记需要 rehash 升级
    return { ok, needsRehash: ok && iterations < PBKDF2_ITERATIONS };
  }

  // 旧格式：裸 hex + 外部 salt + 10000 次 sha512
  try {
    const candidate = crypto.pbkdf2Sync(password, salt || '', LEGACY_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    const expected = Buffer.from(stored, 'hex');
    if (candidate.length !== expected.length) return { ok: false, needsRehash: false };
    const ok = crypto.timingSafeEqual(candidate, expected);
    return { ok, needsRehash: ok };
  } catch (_) {
    return { ok: false, needsRehash: false };
  }
}

/**
 * 判断存储的哈希是否需要升级（迭代次数过低 / 旧格式）
 */
function hashNeedsRehash(stored) {
  if (typeof stored !== 'string') return false;
  if (!stored.startsWith('pbkdf2$')) return true; // 旧裸 hex
  const parts = stored.split('$');
  const iterations = Number(parts[1]);
  return Number.isFinite(iterations) && iterations < PBKDF2_ITERATIONS;
}

/**
 * 创建用户
 */
function createUser(username, password, role = 'editor', createdBy = null) {
  const salt = crypto.randomBytes(PBKDF2_SALT_BYTES).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const now = nowIso();

  run(
    `INSERT INTO users (username, password_hash, salt, role, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, passwordHash, salt, role, now, now, createdBy]
  );
  saveDatabase();

  return get(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE username = ?`, [username]);
}

function ensureUserExists(username, password, role = 'editor', createdBy = null) {
  const existing = getUserByUsername(username);
  if (existing) return existing;
  return createUser(username, password, role, createdBy);
}

/**
 * 验证用户密码
 * 旧格式或低迭代次数的哈希验证通过后,自动 rehash 为新格式(透明升级)
 */
function verifyUser(username, password) {
  const user = get(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE username = ? AND status = "active"`, [username]);
  if (!user) return null;

  const { ok, needsRehash } = verifyPassword(password, user.password_hash, user.salt);
  if (!ok) return null;

  // 透明 rehash 升级(失败仅记录日志,不影响登录)
  if (needsRehash) {
    try {
      const newHash = hashPassword(password, crypto.randomBytes(PBKDF2_SALT_BYTES).toString('hex'));
      run(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        [newHash, nowIso(), user.id]
      );
      saveDatabase();
    } catch (err) {
      console.warn('[user] 透明 rehash 失败,保留旧哈希:', err?.message);
    }
  }

  return user;
}

/**
 * 获取所有用户
 */
function getAllUsers() {
  return all(`SELECT ${USER_PUBLIC_COLUMNS} FROM users ORDER BY created_at DESC`);
}

/**
 * 根据ID获取用户
 */
function getUserById(id) {
  return get(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
}

/**
 * 根据用户名获取用户
 */
function getUserByUsername(username) {
  return get(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE username = ?`, [username]);
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
    const salt = crypto.randomBytes(PBKDF2_SALT_BYTES).toString('hex');
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
  if (updates.nav_mode !== undefined) {
    fields.push('nav_mode = ?');
    values.push(updates.nav_mode);
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
  const user = get(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE id = ?`, [userId]);
  if (!user) {
    throw new Error('用户不存在。');
  }

  // 验证旧密码（兼容旧哈希格式）
  const { ok } = verifyPassword(oldPassword, user.password_hash, user.salt);
  if (!ok) {
    throw new Error('原密码不正确。');
  }

  // 生成新密码哈希（新格式）
  const newSalt = crypto.randomBytes(PBKDF2_SALT_BYTES).toString('hex');
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
  verifyPassword,
  hashNeedsRehash,
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
  // 暴露常量供运维脚本/测试使用
  PBKDF2_ITERATIONS,
  PBKDF2_DIGEST,
};
