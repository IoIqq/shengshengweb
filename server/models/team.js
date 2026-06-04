const { all, get, run, saveDatabase, transaction } = require('./database');
const { nowIso } = require('../utils');

function normalizeGroups(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(',');
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean).join(',');
}

function splitGroups(value) {
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * 转换数据库行为前端对象
 */
function teamRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    note: row.note,
    badge: row.badge,
    email: row.email || '',
    phone: row.phone || '',
    studentId: row.student_id || '',
    grade: row.grade || '',
    major: row.major || '',
    skills: row.skills || '',
    groups: splitGroups(row.groups),
    bio: row.bio || '',
    partyJoinAt: row.party_join_at || '',
    status: row.status || 'active',
    joinedAt: row.joined_at || '',
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 规范化搜索值
 */
function normalizeSearchValue(value) {
  return String(value ?? '').trim();
}

/**
 * 获取所有团队成员
 */
function getAllTeam() {
  return all('SELECT * FROM team ORDER BY order_index ASC, datetime(created_at) ASC').map(teamRowToItem);
}

/**
 * 根据ID获取团队成员
 */
function getTeamById(id) {
  return get('SELECT * FROM team WHERE id = ? LIMIT 1', [id]);
}

/**
 * 获取团队成员列表（支持过滤）
 */
function getTeamList(filters = {}) {
  const search = normalizeSearchValue(filters.search || filters.q || '');
  const status = normalizeSearchValue(filters.status || '');
  const role = normalizeSearchValue(filters.role || '');

  let items = getAllTeam();

  if (search) {
    const searchLower = search.toLowerCase();
    items = items.filter(item =>
      item.name.toLowerCase().includes(searchLower) ||
      item.role.toLowerCase().includes(searchLower) ||
      item.note.toLowerCase().includes(searchLower) ||
      item.major.toLowerCase().includes(searchLower) ||
      item.skills.toLowerCase().includes(searchLower) ||
      (item.groups || []).join(' ').toLowerCase().includes(searchLower) ||
      (item.studentId || '').toLowerCase().includes(searchLower)
    );
  }

  if (status && status !== 'all') {
    items = items.filter(item => item.status === status);
  }

  if (role) {
    const roleLower = role.toLowerCase();
    items = items.filter(item => item.role.toLowerCase().includes(roleLower));
  }

  return items;
}

/**
 * 创建团队成员
 */
function createTeamMember(data) {
  const now = nowIso();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const id = data.id || `team-${timestamp}-${random}`;

  const name = data.name || '';
  const badge = data.badge || (name ? name.charAt(0) : '');
  const status = ['active', 'leave', 'inactive'].includes(data.status) ? data.status : 'active';
  const joinedAt = data.joined_at || data.joinedAt || now;

  // 获取最大排序值
  const maxOrder = get('SELECT MAX(order_index) AS max FROM team')?.max || 0;

  run(
    `INSERT INTO team (id, name, role, note, badge, email, phone, student_id, grade, major, skills, groups, bio, party_join_at, status, joined_at, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      data.role || '',
      data.note || '',
      badge,
      data.email || '',
      data.phone || '',
      data.student_id || data.studentId || '',
      data.grade || '',
      data.major || '',
      data.skills || '',
      normalizeGroups(data.groups),
      data.bio || '',
      data.party_join_at || data.partyJoinAt || '',
      status,
      joinedAt,
      maxOrder + 1,
      now,
      now,
    ],
  );
  saveDatabase();

  // 记录活动日志
  const activityId = `act-${timestamp}-${random}`;
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [activityId, '团队成员新增', 'admin', `${name} 加入团队`, now],
  );
  saveDatabase();

  return getTeamById(id);
}

/**
 * 更新团队成员
 */
function updateTeamMember(id, updates) {
  const existing = getTeamById(id);
  if (!existing) return null;

  const now = nowIso();
  const name = updates.name !== undefined ? updates.name : existing.name;
  const role = updates.role !== undefined ? updates.role : existing.role;
  const note = updates.note !== undefined ? updates.note : existing.note;
  const badge = updates.badge !== undefined ? updates.badge : existing.badge;
  const email = updates.email !== undefined ? updates.email : (existing.email || '');
  const phone = updates.phone !== undefined ? updates.phone : (existing.phone || '');
  const studentId = updates.studentId !== undefined ? updates.studentId : (existing.student_id || '');
  const grade = updates.grade !== undefined ? updates.grade : (existing.grade || '');
  const major = updates.major !== undefined ? updates.major : (existing.major || '');
  const skills = updates.skills !== undefined ? updates.skills : (existing.skills || '');
  const groups = updates.groups !== undefined ? normalizeGroups(updates.groups) : (existing.groups || '');
  const bio = updates.bio !== undefined ? updates.bio : (existing.bio || '');
  const partyJoinAt = updates.partyJoinAt !== undefined ? updates.partyJoinAt : (existing.party_join_at || '');
  const status = updates.status !== undefined && ['active', 'leave', 'inactive'].includes(updates.status)
    ? updates.status
    : (existing.status || 'active');
  const joinedAt = updates.joinedAt !== undefined ? updates.joinedAt : (existing.joined_at || '');

  run(
    'UPDATE team SET name = ?, role = ?, note = ?, badge = ?, email = ?, phone = ?, student_id = ?, grade = ?, major = ?, skills = ?, groups = ?, bio = ?, party_join_at = ?, status = ?, joined_at = ?, updated_at = ? WHERE id = ?',
    [name, role, note, badge, email, phone, studentId, grade, major, skills, groups, bio, partyJoinAt, status, joinedAt, now, id],
  );
  saveDatabase();

  return getTeamById(id);
}

/**
 * 删除团队成员
 */
function deleteTeamMember(id) {
  const existing = getTeamById(id);
  if (!existing) {
    throw new Error('团队成员不存在。');
  }

  run('DELETE FROM team WHERE id = ?', [id]);
  saveDatabase();
}

/**
 * 基于活动明细估算成员贡献
 */
function getMemberContributionStats(memberId) {
  const member = getTeamById(memberId);
  if (!member) return null;
  const keyword = `%${member.name}%`;
  const recent = all(
    `SELECT id, title, meta, detail, created_at FROM activity
     WHERE detail LIKE ? OR meta LIKE ?
     ORDER BY datetime(created_at) DESC LIMIT 5`,
    [keyword, keyword],
  );
  const countRow = get(
    `SELECT COUNT(*) AS total FROM activity
     WHERE detail LIKE ? OR meta LIKE ?`,
    [keyword, keyword],
  );

  return {
    count: Number(countRow?.total || 0),
    recent: recent.map((row) => ({
      id: row.id,
      title: row.title,
      meta: row.meta,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  };
}

/**
 * 更新团队成员排序
 */
function updateTeamOrder(id, newOrderIndex) {
  const existing = getTeamById(id);
  if (!existing) {
    throw new Error('团队成员不存在。');
  }

  if (!Number.isInteger(newOrderIndex) || newOrderIndex < 1) {
    throw new Error('排序值无效。');
  }

  const now = nowIso();

  return transaction(() => {
    const oldOrder = existing.order_index;
    if (oldOrder === newOrderIndex) return getAllTeam();

    if (newOrderIndex < oldOrder) {
      // 向前移动：将中间的成员向后移
      run('UPDATE team SET order_index = order_index + 1 WHERE order_index >= ? AND order_index < ?', [newOrderIndex, oldOrder]);
    } else {
      // 向后移动：将中间的成员向前移
      run('UPDATE team SET order_index = order_index - 1 WHERE order_index > ? AND order_index <= ?', [oldOrder, newOrderIndex]);
    }

    run('UPDATE team SET order_index = ?, updated_at = ? WHERE id = ?', [newOrderIndex, now, id]);
    saveDatabase();

    return getAllTeam();
  });
}

module.exports = {
  getAllTeam,
  getTeamById,
  getTeamList,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getMemberContributionStats,
  updateTeamOrder,
  teamRowToItem,
};
