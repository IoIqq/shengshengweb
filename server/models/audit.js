const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

/**
 * 记录审计日志
 */
function createAuditLog(data) {
  const {
    userId,
    username,
    role,
    action,
    resourceType,
    resourceId = null,
    details = null,
    ipAddress = null,
    userAgent = null
  } = data;

  run(
    `INSERT INTO audit_logs (user_id, username, role, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, username, role, action, resourceType, resourceId, details, ipAddress, userAgent, nowIso()]
  );
  saveDatabase();
}

/**
 * 获取审计日志（支持筛选和分页）
 */
function getAuditLogs(filters = {}) {
  const { userId, action, resourceType, startDate, endDate, limit = 50, offset = 0 } = filters;

  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (resourceType) {
    sql += ' AND resource_type = ?';
    params.push(resourceType);
  }
  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND created_at <= ?';
    params.push(endDate);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return all(sql, params);
}

/**
 * 获取审计日志总数
 */
function getAuditLogCount(filters = {}) {
  const { userId, action, resourceType, startDate, endDate } = filters;

  let sql = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (resourceType) {
    sql += ' AND resource_type = ?';
    params.push(resourceType);
  }
  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND created_at <= ?';
    params.push(endDate);
  }

  const result = get(sql, params);
  return result ? result.count : 0;
}

/**
 * 清理旧的审计日志（保留指定天数）
 */
function cleanupOldAuditLogs(retentionDays = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  run('DELETE FROM audit_logs WHERE created_at < ?', [cutoffDate]);
  saveDatabase();
}

module.exports = {
  createAuditLog,
  getAuditLogs,
  getAuditLogCount,
  cleanupOldAuditLogs
};
