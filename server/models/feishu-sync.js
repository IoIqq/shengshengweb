/**
 * 飞书同步状态模型 —— 记录每行飞书记录的导入/回写状态
 * record_id 为飞书行 ID，作去重键；避免重复导入同一申请。
 * status: synced(已导入待回写) / error(匹配失败,可重试) / backed(已回写审批状态)
 */
const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

/** 某行是否已成功导入（synced 或 backed 都算已处理；error 不算——可重试） */
function isImported(recordId) {
  const row = get('SELECT status FROM feishu_sync_state WHERE record_id = ? LIMIT 1', [recordId]);
  return !!(row && (row.status === 'synced' || row.status === 'backed'));
}

function getByRecordId(recordId) {
  return get('SELECT * FROM feishu_sync_state WHERE record_id = ? LIMIT 1', [recordId]);
}

function getByBorrowId(borrowRequestId) {
  return get('SELECT * FROM feishu_sync_state WHERE borrow_request_id = ? LIMIT 1', [borrowRequestId]);
}

/** 标记为已导入，关联借用申请 ID */
function markImported(recordId, borrowRequestId) {
  const now = nowIso();
  run(
    `INSERT INTO feishu_sync_state (record_id, borrow_request_id, status, error, synced_at, updated_at)
     VALUES (?, ?, 'synced', '', ?, ?)
     ON CONFLICT(record_id) DO UPDATE SET borrow_request_id=excluded.borrow_request_id, status='synced', error='', updated_at=excluded.updated_at`,
    [recordId, borrowRequestId, now, now],
  );
  saveDatabase();
}

/** 标记为匹配失败（设备名找不到等），error 行会在下次同步重试 */
function markError(recordId, error) {
  const now = nowIso();
  run(
    `INSERT INTO feishu_sync_state (record_id, status, error, synced_at, updated_at)
     VALUES (?, 'error', ?, ?, ?)
     ON CONFLICT(record_id) DO UPDATE SET status='error', error=excluded.error, updated_at=excluded.updated_at`,
    [recordId, String(error || '').slice(0, 500), now, now],
  );
  saveDatabase();
}

/** 标记审批状态已回写飞书 */
function markBacked(recordId) {
  const now = nowIso();
  run('UPDATE feishu_sync_state SET status = ?, updated_at = ? WHERE record_id = ?', ['backed', now, recordId]);
  saveDatabase();
}

/** 异常列表（匹配失败的行） */
function listErrors() {
  return all('SELECT * FROM feishu_sync_state WHERE status = ? ORDER BY datetime(updated_at) DESC', ['error']);
}

/** 已导入但尚未回写的行（用于回写重试） */
function listPendingWriteback() {
  return all("SELECT * FROM feishu_sync_state WHERE status = 'synced'");
}

/** 各状态计数 */
function stats() {
  const count = (where) => get(`SELECT COUNT(*) AS n FROM feishu_sync_state WHERE ${where}`, [])?.n || 0;
  return { synced: count("status = 'synced'"), backed: count("status = 'backed'"), errored: count("status = 'error'") };
}

module.exports = {
  isImported,
  getByRecordId,
  getByBorrowId,
  markImported,
  markError,
  markBacked,
  listErrors,
  listPendingWriteback,
  stats,
};
