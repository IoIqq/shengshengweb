const express = require('express');
const router = express.Router();
const { todo: todoModel, audit: auditModel } = require('../models');
const { requireAuth, requireEditor } = require('../middleware/auth');
const crypto = require('crypto');

/**
 * 生成随机ID
 */
function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * 规范化优先级
 */
function normalizePriority(value) {
  if (value === '高' || value === '中' || value === '低') return value;
  return '中';
}

/**
 * 规范化截止日期
 */
function normalizeDueDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; // undefined = 校验失败
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return s;
}

/**
 * 获取所有待办
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const todos = todoModel.getAllTodos();
    res.json({ ok: true, items: todos });
  } catch (error) {
    console.error('获取待办列表失败:', error);
    res.status(500).json({ error: '获取待办列表失败。' });
  }
});

/**
 * 创建待办
 */
router.post('/', requireAuth, requireEditor, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const priority = normalizePriority(String(req.body?.priority || '中'));

  if (!title) {
    return res.status(400).json({ error: '请输入待办标题。' });
  }

  const dueDate = normalizeDueDate(req.body?.dueDate);
  if (dueDate === undefined) {
    return res.status(400).json({ error: '截止日期格式有误，需为 YYYY-MM-DD。' });
  }

  const assigneeId = req.body?.assigneeId ? String(req.body.assigneeId).trim() : null;

  try {
    const newTodo = todoModel.createTodo({
      id: randomId('todo'),
      title,
      priority,
      due_date: dueDate,
      assignee_id: assigneeId
    });

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'create',
      resourceType: 'todo',
      resourceId: newTodo.id,
      details: JSON.stringify({ title, priority }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true, item: newTodo });
  } catch (error) {
    console.error('创建待办失败:', error);
    res.status(500).json({ error: '创建待办失败。' });
  }
});

/**
 * 更新待办
 */
router.patch('/:id', requireAuth, requireEditor, (req, res) => {
  const id = String(req.params.id || '');
  const updates = {};

  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) {
      return res.status(400).json({ error: '待办标题不能为空。' });
    }
    updates.title = title;
  }

  if (req.body?.priority !== undefined) {
    updates.priority = normalizePriority(String(req.body.priority));
  }

  if (req.body?.done !== undefined) {
    updates.done = Boolean(req.body.done);
  }

  if (req.body?.dueDate !== undefined) {
    const dueDate = normalizeDueDate(req.body.dueDate);
    if (dueDate === undefined) {
      return res.status(400).json({ error: '截止日期格式有误。' });
    }
    updates.due_date = dueDate;
  }

  if (req.body?.assigneeId !== undefined) {
    updates.assignee_id = req.body.assigneeId ? String(req.body.assigneeId).trim() : null;
  }

  try {
    const updatedTodo = todoModel.updateTodo(id, updates);

    if (!updatedTodo) {
      return res.status(404).json({ error: '待办不存在。' });
    }

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'update',
      resourceType: 'todo',
      resourceId: id,
      details: JSON.stringify(Object.keys(updates)),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true, item: updatedTodo });
  } catch (error) {
    console.error('更新待办失败:', error);
    res.status(500).json({ error: '更新待办失败。' });
  }
});

/**
 * 删除待办
 */
router.delete('/:id', requireAuth, requireEditor, (req, res) => {
  const id = String(req.params.id || '');

  try {
    const todo = todoModel.getTodoById(id);
    if (!todo) {
      return res.status(404).json({ error: '待办不存在。' });
    }

    todoModel.deleteTodo(id);

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'delete',
      resourceType: 'todo',
      resourceId: id,
      details: JSON.stringify({ title: todo.title }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('删除待办失败:', error);
    res.status(500).json({ error: '删除待办失败。' });
  }
});

module.exports = router;
