const { all, get } = require('./database');
const { nowLocalDateKey, nowIso } = require('../utils');

function getProfileSummary(user) {
  const username = String(user?.username || '');
  const userId = user?.id;
  const today = nowLocalDateKey();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const todoRows = all(
    `SELECT id FROM todos
     WHERE done = 0
       AND due_date IS NOT NULL
       AND substr(due_date, 1, 10) = ?
       AND (assignee_id IS NULL OR assignee_id = '' OR assignee_id = ? OR assignee_id = ?)`,
    [today, String(userId || ''), username],
  );

  const borrowRow = get(
    `SELECT COUNT(*) AS total FROM borrow_requests
     WHERE applicant = ? AND status = 'approved' AND return_status != 'returned'`,
    [username],
  );

  const activeRow = get(
    `SELECT COUNT(*) AS total FROM activity
     WHERE datetime(created_at) >= datetime(?)
       AND (meta LIKE ? OR detail LIKE ?)`,
    [sevenDaysAgo, `%${username}%`, `%${username}%`],
  );

  return {
    todayTodos: todoRows.length,
    borrowedDevices: Number(borrowRow?.total || 0),
    weekActiveScore: Number(activeRow?.total || 0),
    generatedAt: nowIso(),
  };
}

module.exports = {
  getProfileSummary,
};
