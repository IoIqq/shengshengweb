const { all, get } = require('../database');
const { deviceRowToItem, borrowRequestRowToItem } = require('./common');
const { normalizeSearchValue } = require('../utils/validators');

// 获取设备列表
function getDeviceList(query = {}) {
  const search = normalizeSearchValue(query.search || query.q || '');
  const status = normalizeSearchValue(query.status || '');
  const category = normalizeSearchValue(query.category || '');

  let sql = 'SELECT * FROM devices WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR asset_no LIKE ? OR location LIKE ? OR owner LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (category) {
    sql += ' AND category LIKE ?';
    params.push(`%${category}%`);
  }

  sql += ' ORDER BY datetime(created_at) DESC';

  return all(sql, params).map(deviceRowToItem);
}

// 根据ID获取设备
function getDeviceById(id) {
  const row = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
  return row ? deviceRowToItem(row) : null;
}

// 获取借用申请列表
function getBorrowRequestList(query = {}) {
  const status = normalizeSearchValue(query.status || '');
  const returnStatus = normalizeSearchValue(query.returnStatus || '');

  let sql = `
    SELECT borrow_requests.*, devices.name AS device_name
    FROM borrow_requests
    LEFT JOIN devices ON devices.id = borrow_requests.device_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND borrow_requests.status = ?';
    params.push(status);
  }

  if (returnStatus && returnStatus !== 'all') {
    sql += ' AND borrow_requests.return_status = ?';
    params.push(returnStatus);
  }

  sql += ' ORDER BY datetime(borrow_requests.created_at) DESC';

  return all(sql, params).map(borrowRequestRowToItem);
}

// 根据ID获取借用申请
function getBorrowRequestById(id) {
  const row = get(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     WHERE borrow_requests.id = ? LIMIT 1`,
    [id]
  );
  return row ? borrowRequestRowToItem(row) : null;
}

module.exports = {
  getDeviceList,
  getDeviceById,
  getBorrowRequestList,
  getBorrowRequestById,
};
