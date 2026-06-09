const { all, get, run, saveDatabase, transaction } = require('./database');
const userModel = require('./user');
const { nowIso } = require('../utils');

function createRequestId() {
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function registrationRequestRowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || '',
    contact: row.contact || '',
    reason: row.reason || '',
    status: row.status,
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at || '',
    rejectReason: row.reject_reason || '',
    createdUserId: row.created_user_id || null,
    ipAddress: row.ip_address || '',
    userAgent: row.user_agent || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRegistrationRequestById(id) {
  return get('SELECT * FROM registration_requests WHERE id = ? LIMIT 1', [id]);
}

function getRegistrationRequests(filters = {}) {
  const clauses = [];
  const params = [];
  const status = String(filters.status || 'pending').trim();

  if (status && status !== 'all') {
    clauses.push('status = ?');
    params.push(status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT * FROM registration_requests
     ${where}
     ORDER BY datetime(created_at) DESC`,
    params
  ).map(registrationRequestRowToItem);
}

function hasPendingRegistrationRequest(username) {
  return !!get("SELECT id FROM registration_requests WHERE LOWER(username) = LOWER(?) AND status = 'pending' LIMIT 1", [username]);
}

function createRegistrationRequest(data) {
  const now = nowIso();
  const id = data.id || createRequestId();

  run(
    `INSERT INTO registration_requests
      (id, username, display_name, contact, reason, status, reviewed_by, reviewed_at, reject_reason, created_user_id, ip_address, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.username,
      data.displayName || data.display_name || '',
      data.contact || '',
      data.reason || '',
      'pending',
      '',
      '',
      '',
      null,
      data.ipAddress || data.ip_address || '',
      data.userAgent || data.user_agent || '',
      now,
      now,
    ]
  );
  saveDatabase();

  return getRegistrationRequestById(id);
}

function approveRegistrationRequest(id, data, reviewer) {
  const existing = getRegistrationRequestById(id);
  if (!existing) {
    throw new Error('注册申请不存在。');
  }
  if (existing.status !== 'pending') {
    throw new Error('只有待审核申请才能处理。');
  }
  if (userModel.usernameExists(existing.username)) {
    throw new Error('用户名已存在。');
  }

  const now = nowIso();
  const role = data.role || 'guest';
  const displayName = data.displayName ? data.displayName : existing.display_name;

  return transaction(() => {
    const createdUser = userModel.createUser(existing.username, data.password, role, reviewer.id);
    if (displayName) {
      userModel.updateUser(createdUser.id, { display_name: displayName });
    }

    run(
      `UPDATE registration_requests
       SET status = ?, reviewed_by = ?, reviewed_at = ?, created_user_id = ?, display_name = ?, updated_at = ?
       WHERE id = ?`,
      ['approved', reviewer.username, now, createdUser.id, displayName || '', now, id]
    );

    return {
      request: registrationRequestRowToItem(getRegistrationRequestById(id)),
      user: userModel.getUserById(createdUser.id),
    };
  });
}

function rejectRegistrationRequest(id, data, reviewer) {
  const existing = getRegistrationRequestById(id);
  if (!existing) {
    throw new Error('注册申请不存在。');
  }
  if (existing.status !== 'pending') {
    throw new Error('只有待审核申请才能处理。');
  }

  const now = nowIso();
  run(
    `UPDATE registration_requests
     SET status = ?, reviewed_by = ?, reviewed_at = ?, reject_reason = ?, updated_at = ?
     WHERE id = ?`,
    ['rejected', reviewer.username, now, data.rejectReason || '', now, id]
  );
  saveDatabase();

  return registrationRequestRowToItem(getRegistrationRequestById(id));
}

module.exports = {
  registrationRequestRowToItem,
  getRegistrationRequests,
  getRegistrationRequestById,
  hasPendingRegistrationRequest,
  createRegistrationRequest,
  approveRegistrationRequest,
  rejectRegistrationRequest,
};
