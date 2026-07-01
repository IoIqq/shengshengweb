const { all, get, run, saveDatabase, transaction } = require('./database');
const { nowIso } = require('../utils');
const deviceModel = require('./device');

/**
 * 转换数据库行为前端对象
 */
function borrowRequestRowToItem(row) {
  return {
    id: row.id,
    applicant: row.applicant,
    deviceId: row.device_id,
    deviceName: row.device_name,
    purpose: row.purpose,
    borrowAt: row.borrow_at,
    expectedReturnAt: row.expected_return_at,
    note: row.note,
    status: row.status,
    returnStatus: row.return_status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    returnedAt: row.returned_at,
    rejectReason: row.reject_reason || '',
    createdBy: row.created_by || '',
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
 * 获取借用申请列表（支持过滤）
 */
function getBorrowRequestList(filters = {}) {
  const clauses = [];
  const params = [];
  const searchClause = buildSearchClause(
    ['borrow_requests.applicant', 'borrow_requests.purpose', 'borrow_requests.note', 'borrow_requests.device_id', 'borrow_requests.approved_by', 'borrow_requests.status', 'borrow_requests.return_status', 'devices.name'],
    filters.search || filters.q,
    params,
  );
  if (searchClause) clauses.push(searchClause);

  const status = normalizeSearchValue(filters.status);
  if (status && status !== 'all') {
    if (status === 'returned') {
      clauses.push("borrow_requests.return_status = 'returned'");
    } else {
      clauses.push('borrow_requests.status = ?');
      params.push(status);
    }
  }

  const deviceId = normalizeSearchValue(filters.deviceId);
  if (deviceId) {
    clauses.push('borrow_requests.device_id = ?');
    params.push(deviceId);
  }

  const applicant = normalizeSearchValue(filters.applicant);
  if (applicant) {
    clauses.push("LOWER(COALESCE(borrow_requests.applicant, '')) LIKE ?");
    params.push(`%${applicant.toLowerCase()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     ${where}
     ORDER BY datetime(borrow_requests.created_at) DESC`,
    params,
  ).map(borrowRequestRowToItem);
}

/**
 * 根据ID获取借用申请
 */
function getBorrowRequestById(id) {
  return get(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     WHERE borrow_requests.id = ? LIMIT 1`,
    [id],
  );
}

/**
 * 获取所有借用申请
 */
function getAllBorrowRequests(filters = {}) {
  return getBorrowRequestList(filters);
}

/**
 * 创建借用申请
 */
function createBorrowRequest(data) {
  const now = nowIso();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const id = data.id || `borrow-${timestamp}-${random}`;

  // 验证设备是否存在
  const device = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [data.device_id || data.deviceId]);
  if (!device) {
    throw new Error('申请设备不存在。');
  }

  run(
    `INSERT INTO borrow_requests
      (id, applicant, device_id, purpose, borrow_at, expected_return_at, note, status, return_status, approved_by, approved_at, returned_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.applicant,
      data.device_id || data.deviceId,
      data.purpose,
      data.borrow_at || data.borrowAt,
      data.expected_return_at || data.expectedReturnAt,
      data.note || '',
      'pending',
      'not_returned',
      '',
      '',
      '',
      data.created_by || data.createdBy || '',
      now,
      now,
    ],
  );
  saveDatabase();

  return getBorrowRequestById(id);
}

/**
 * 审批借用申请（approve/reject）
 */
function approveBorrowRequest(id, approvedBy, action = 'approved') {
  const existing = getBorrowRequestById(id);
  if (!existing) {
    throw new Error('借出申请不存在。');
  }

  if (existing.status !== 'pending') {
    throw new Error('只有待审申请才能审批。');
  }

  const device = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [existing.device_id]);
  if (!device) {
    throw new Error('关联设备不存在。');
  }

  if (action === 'approved' && device.status !== 'available') {
    throw new Error('该设备当前不可借出。');
  }

  const now = nowIso();

  return transaction(() => {
    if (action === 'approved') {
      run(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [action, approvedBy, now, now, id],
      );
      // 联动更新设备状态为borrowed
      deviceModel.updateDeviceStatus(existing.device_id, 'borrowed');
    } else if (action === 'rejected') {
      run(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [action, approvedBy, now, now, id],
      );
    }
    saveDatabase();
    return getBorrowRequestById(id);
  });
}

/**
 * 归还设备
 */
function returnBorrowRequest(id) {
  const existing = getBorrowRequestById(id);
  if (!existing) {
    throw new Error('借出申请不存在。');
  }

  if (existing.status !== 'approved') {
    throw new Error('只有已通过的申请才能归还。');
  }

  if (existing.return_status === 'returned') {
    throw new Error('该申请已经完成归还。');
  }

  const now = nowIso();

  return transaction(() => {
    run(
      'UPDATE borrow_requests SET return_status = ?, returned_at = ?, updated_at = ? WHERE id = ?',
      ['returned', now, now, id],
    );
    // 联动更新设备状态为available
    deviceModel.updateDeviceStatus(existing.device_id, 'available');
    saveDatabase();
    return getBorrowRequestById(id);
  });
}

/**
 * 更新借用申请（通用更新方法，支持审批、归还等操作）
 */
function updateBorrowRequest(id, updates, approvedBy) {
  const existing = getBorrowRequestById(id);
  if (!existing) {
    throw new Error('借出申请不存在。');
  }

  const now = nowIso();
  const device = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [existing.device_id]);

  // 处理审批操作
  if (updates.status === 'approved') {
    if (existing.status !== 'pending') {
      throw new Error('只有待审申请才能通过。');
    }
    if (!device) {
      throw new Error('关联设备不存在。');
    }
    if (device.status !== 'available') {
      throw new Error('该设备当前不可借出。');
    }
  }

  if (updates.status === 'rejected' && existing.status !== 'pending') {
    throw new Error('只有待审申请才能拒绝。');
  }

  // 处理归还操作
  if (updates.returnStatus === 'returned') {
    if (existing.status !== 'approved') {
      throw new Error('只有已通过的申请才能归还。');
    }
    if (existing.return_status === 'returned') {
      throw new Error('该申请已经完成归还。');
    }
  }

  return transaction(() => {
    if (updates.status === 'approved') {
      run(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [updates.status, approvedBy || 'admin', now, now, id],
      );
      deviceModel.updateDeviceStatus(existing.device_id, 'borrowed');
    } else if (updates.status === 'rejected') {
      run(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, reject_reason = ?, updated_at = ? WHERE id = ?',
        [updates.status, approvedBy || 'admin', now, updates.rejectReason || '', now, id],
      );
    } else if (updates.returnStatus === 'returned') {
      run(
        'UPDATE borrow_requests SET return_status = ?, returned_at = ?, updated_at = ? WHERE id = ?',
        [updates.returnStatus, now, now, id],
      );
      deviceModel.updateDeviceStatus(existing.device_id, 'available');
    }
    saveDatabase();
    return getBorrowRequestById(id);
  });
}

/**
 * 获取逾期借出列表
 */
function getOverdueBorrows() {
  const now = nowIso();
  const rows = all(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     WHERE borrow_requests.status = 'approved'
       AND borrow_requests.return_status != 'returned'
       AND borrow_requests.expected_return_at < ?`,
    [now],
  );
  return rows.map((row) => {
    const item = borrowRequestRowToItem(row);
    const overdueMs = Date.now() - new Date(row.expected_return_at).getTime();
    const overdueDays = Math.floor(overdueMs / 86400000);
    const overdueHours = Math.floor((overdueMs % 86400000) / 3600000);
    item.overdueDays = overdueDays;
    item.overdueHours = overdueHours;
    item.overdueLabel = overdueDays > 0
      ? `逾期 ${overdueDays} 天`
      : `逾期 ${overdueHours} 小时`;
    return item;
  });
}

/**
 * 获取借出统计信息（含逾期）
 */
function getBorrowStats() {
  const rows = all('SELECT status, return_status, expected_return_at FROM borrow_requests');
  const now = new Date();
  let total = 0, pending = 0, approved = 0, rejected = 0, returned = 0, overdue = 0, cancelled = 0;

  rows.forEach((row) => {
    total++;
    if (row.status === 'pending') pending++;
    if (row.status === 'approved') approved++;
    if (row.status === 'rejected') rejected++;
    if (row.status === 'cancelled') cancelled++;
    if (row.return_status === 'returned') returned++;
    if (row.status === 'approved' && row.return_status !== 'returned' && new Date(row.expected_return_at) < now) {
      overdue++;
    }
  });

  return { total, pending, approved, rejected, returned, overdue, cancelled };
}

/**
 * 撤销借用申请（申请人自行撤销待审申请）
 */
function cancelBorrowRequest(id, createdBy) {
  const existing = getBorrowRequestById(id);
  if (!existing) throw new Error('借出申请不存在。');
  if (existing.created_by !== createdBy) throw new Error('无权撤销他人的申请。');
  if (existing.status !== 'pending') throw new Error('只有待审申请才能撤销。');

  const now = nowIso();
  run('UPDATE borrow_requests SET status = ?, updated_at = ? WHERE id = ?', ['cancelled', now, id]);
  saveDatabase();
  return getBorrowRequestById(id);
}

module.exports = {
  getBorrowRequestList,
  getBorrowRequestById,
  getAllBorrowRequests,
  createBorrowRequest,
  approveBorrowRequest,
  returnBorrowRequest,
  updateBorrowRequest,
  cancelBorrowRequest,
  borrowRequestRowToItem,
  getOverdueBorrows,
  getBorrowStats,
};
