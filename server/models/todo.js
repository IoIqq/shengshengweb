const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

/**
 * 获取所有待办
 */
function getAllTodos() {
  return all('SELECT * FROM todos ORDER BY created_at DESC');
}

/**
 * 根据ID获取待办
 */
function getTodoById(id) {
  return get('SELECT * FROM todos WHERE id = ?', [id]);
}

/**
 * 创建待办
 */
function createTodo(data) {
  const now = nowIso();
  const { id, title, priority = '中', due_date = null, assignee_id = null } = data;

  run(
    `INSERT INTO todos (id, title, priority, done, due_date, assignee_id, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
    [id, title, priority, due_date, assignee_id, now, now]
  );
  saveDatabase();

  return getTodoById(id);
}

/**
 * 更新待办
 */
function updateTodo(id, updates) {
  const now = nowIso();
  const fields = [];
  const values = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.done !== undefined) {
    fields.push('done = ?');
    values.push(updates.done ? 1 : 0);
    fields.push('completed_at = ?');
    values.push(updates.done ? now : null);
  }
  if (updates.due_date !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.due_date);
  }
  if (updates.assignee_id !== undefined) {
    fields.push('assignee_id = ?');
    values.push(updates.assignee_id);
  }

  if (fields.length === 0) return getTodoById(id);

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getTodoById(id);
}

/**
 * 删除待办
 */
function deleteTodo(id) {
  run('DELETE FROM todos WHERE id = ?', [id]);
  saveDatabase();
}

/**
 * 切换待办完成状态
 */
function toggleTodo(id) {
  const todo = getTodoById(id);
  if (!todo) return null;

  const newDone = todo.done ? 0 : 1;
  const completedAt = newDone ? nowIso() : null;

  run(
    'UPDATE todos SET done = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    [newDone, completedAt, nowIso(), id]
  );
  saveDatabase();

  return getTodoById(id);
}

module.exports = {
  getAllTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodo
};
