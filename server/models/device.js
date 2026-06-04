const { all, get, run, saveDatabase, transaction } = require('./database');
const { nowIso } = require('../utils');

/**
 * 转换数据库行为前端对象
 */
function deviceRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    assetNo: row.asset_no,
    status: row.status,
    model: row.model,
    purchaseDate: row.purchase_date,
    image: row.image,
    serialNo: row.serial_no || '',
    warrantyUntil: row.warranty_until || '',
    price: typeof row.price === 'number' ? row.price : Number(row.price || 0),
    location: row.location,
    owner: row.owner,
    note: row.note,
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
 * 构建搜索子句
 */
function buildSearchClause(columns, term, params) {
  const search = normalizeSearchValue(term);
  if (!search) return '';
  const like = `%${search.toLowerCase()}%`;
  params.push(...columns.map(() => like));
  return `(${columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(' OR ')})`;
}

/**
 * 获取设备列表（支持过滤）
 */
function getDeviceList(filters = {}) {
  const clauses = [];
  const params = [];
  const searchClause = buildSearchClause(
    ['name', 'category', 'asset_no', 'location', 'owner', 'note'],
    filters.search || filters.q,
    params,
  );
  if (searchClause) clauses.push(searchClause);

  const status = normalizeSearchValue(filters.status);
  if (status && status !== 'all') {
    clauses.push('status = ?');
    params.push(status);
  }

  const category = normalizeSearchValue(filters.category);
  if (category) {
    clauses.push("LOWER(COALESCE(category, '')) LIKE ?");
    params.push(`%${category.toLowerCase()}%`);
  }

  const owner = normalizeSearchValue(filters.owner);
  if (owner) {
    clauses.push("LOWER(COALESCE(owner, '')) LIKE ?");
    params.push(`%${owner.toLowerCase()}%`);
  }

  const assetNo = normalizeSearchValue(filters.assetNo);
  if (assetNo) {
    clauses.push("LOWER(COALESCE(asset_no, '')) LIKE ?");
    params.push(`%${assetNo.toLowerCase()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`SELECT * FROM devices ${where} ORDER BY datetime(created_at) DESC`, params).map(deviceRowToItem);
}

/**
 * 根据ID获取设备
 */
function getDeviceById(id) {
  return get('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
}

/**
 * 获取所有设备
 */
function getAllDevices(filters = {}) {
  return getDeviceList(filters);
}

/**
 * 创建设备
 */
function createDevice(data) {
  const now = nowIso();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const id = data.id || `device-${timestamp}-${random}`;

  const status = ['available', 'borrowed', 'maintenance'].includes(data.status)
    ? data.status
    : 'available';

  run(
    `INSERT INTO devices (id, name, category, asset_no, status, model, purchase_date, image, serial_no, warranty_until, price, location, owner, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.category,
      data.asset_no || data.assetNo,
      status,
      data.model || '',
      data.purchase_date || data.purchaseDate || '',
      data.image || '',
      data.serial_no || data.serialNo || '',
      data.warranty_until || data.warrantyUntil || '',
      Number.isFinite(Number(data.price)) ? Number(data.price) : 0,
      data.location || '',
      data.owner || '',
      data.note || '',
      now,
      now,
    ],
  );
  saveDatabase();

  return getDeviceById(id);
}

/**
 * 更新设备
 */
function updateDevice(id, updates) {
  const existing = getDeviceById(id);
  if (!existing) return null;

  const now = nowIso();
  const name = updates.name !== undefined ? updates.name : existing.name;
  const category = updates.category !== undefined ? updates.category : existing.category;
  const assetNo = updates.assetNo !== undefined ? updates.assetNo : updates.asset_no !== undefined ? updates.asset_no : existing.asset_no;
  const status = updates.status !== undefined ? updates.status : existing.status;
  const model = updates.model !== undefined ? updates.model : (existing.model || '');
  const purchaseDate = updates.purchaseDate !== undefined ? updates.purchaseDate : (existing.purchase_date || '');
  const image = updates.image !== undefined ? updates.image : (existing.image || '');
  const serialNo = updates.serialNo !== undefined ? updates.serialNo : (existing.serial_no || '');
  const warrantyUntil = updates.warrantyUntil !== undefined ? updates.warrantyUntil : (existing.warranty_until || '');
  const priceValue = updates.price !== undefined ? Number(updates.price) : Number(existing.price || 0);
  const price = Number.isFinite(priceValue) ? priceValue : 0;
  const location = updates.location !== undefined ? updates.location : existing.location;
  const owner = updates.owner !== undefined ? updates.owner : existing.owner;
  const note = updates.note !== undefined ? updates.note : existing.note;

  const nextStatus = ['available', 'borrowed', 'maintenance'].includes(status) ? status : existing.status;

  run(
    `UPDATE devices
     SET name = ?, category = ?, asset_no = ?, status = ?, model = ?, purchase_date = ?, image = ?, serial_no = ?, warranty_until = ?, price = ?, location = ?, owner = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [name, category, assetNo, nextStatus, model, purchaseDate, image, serialNo, warrantyUntil, price, location, owner, note, now, id],
  );
  saveDatabase();

  return getDeviceById(id);
}

/**
 * 更新设备状态（供借用模块调用）
 */
function updateDeviceStatus(deviceId, status) {
  const validStatus = ['available', 'borrowed', 'maintenance'].includes(status) ? status : 'available';
  run('UPDATE devices SET status = ?, updated_at = ? WHERE id = ?', [validStatus, nowIso(), deviceId]);
  saveDatabase();
}

/**
 * 获取某列的去重非空值（用于 datalist 推荐）
 */
function getDistinctValues(column) {
  const allowed = new Set(['category', 'location', 'owner']);
  if (!allowed.has(column)) return [];
  const rows = all(
    `SELECT DISTINCT ${column} AS value FROM devices WHERE ${column} IS NOT NULL AND TRIM(${column}) != '' ORDER BY ${column} ASC`,
  );
  return rows.map((row) => row.value).filter(Boolean);
}

/**
 * 删除设备
 */
function deleteDevice(id) {
  // 检查是否有活跃的借用
  const activeBorrow = get(
    "SELECT * FROM borrow_requests WHERE device_id = ? AND status = 'approved' AND return_status != 'returned' LIMIT 1",
    [id],
  );

  if (activeBorrow) {
    throw new Error('该设备正在借出中，无法删除。');
  }

  run('DELETE FROM devices WHERE id = ?', [id]);
  saveDatabase();
}

module.exports = {
  getDeviceList,
  getDeviceById,
  getAllDevices,
  getDistinctValues,
  createDevice,
  updateDevice,
  updateDeviceStatus,
  deleteDevice,
  deviceRowToItem,
};
