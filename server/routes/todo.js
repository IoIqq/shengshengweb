const express = require("express");
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction } = require("../database");

// 导入中间件
const { requireAuth } = require("../middleware/auth");

// 导入工具函数
const { nowIso, randomId } = require("../utils/helpers");
const { normalizePriority, normalizeDueDate } = require("../utils/validators");

// 导入服务
const { todoRowToItem } = require("../services/common");

// ========== 待办路由 ==========

// 获取待办列表（通过 bootstrap 返回，这里保留接口以备扩展）
router.get("/todos", requireAuth, (req, res) => {
  const items = require("../database").all("SELECT * FROM todos ORDER BY datetime(created_at) DESC")
    .map(todoRowToItem);
  res.json({ ok: true, items });
});

// 创建待办
router.post("/todos", requireAuth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "").trim();
  const priority = normalizePriority(body.priority);
  const dueDate = normalizeDueDate(body.dueDate);
  const assigneeId = body.assigneeId ? String(body.assigneeId).trim() : null;
  if (!title) {
    return res.status(400).json({ error: "请输入待办标题。" });
  }
  if (dueDate === undefined) {
    return res.status(400).json({ error: "截止日期格式不正确。" });
  }

  const item = {
    id: randomId("todo"),
    title,
    priority,
    done: 0,
    due_date: dueDate,
    assignee_id: assigneeId,
    completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  transaction(() => {
    runWrite(
      `INSERT INTO todos (id, title, priority, done, due_date, assignee_id, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.title, item.priority, item.done, item.due_date, item.assignee_id, item.completed_at, item.created_at, item.updated_at],
    );
  });
  res.json({ ok: true, item: todoRowToItem(item) });
});

// 更新待办
router.patch("/todos/:id", requireAuth, (req, res) => {
  const id = String(req.params.id || "");
  const existing = get("SELECT * FROM todos WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "待办不存在。" });
  }

  const body = req.body || {};
  const title = body.title !== undefined ? String(body.title || "").trim() : existing.title;
  const priority = body.priority !== undefined ? normalizePriority(body.priority) : existing.priority;
  const done = body.done !== undefined ? Boolean(body.done) : Boolean(existing.done);
  const dueDate = body.dueDate !== undefined ? normalizeDueDate(body.dueDate) : existing.due_date;
  const assigneeId = body.assigneeId !== undefined ? (body.assigneeId ? String(body.assigneeId).trim() : null) : existing.assignee_id;
  if (dueDate === undefined) {
    return res.status(400).json({ error: "截止日期格式不正确。" });
  }

  const completedAt = done && !existing.done ? nowIso() : (!done && existing.done ? null : existing.completed_at);

  transaction(() => {
    runWrite(
      `UPDATE todos
       SET title = ?, priority = ?, done = ?, due_date = ?, assignee_id = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [title, priority, done ? 1 : 0, dueDate, assigneeId, completedAt, nowIso(), id],
    );
  });

  const updated = get("SELECT * FROM todos WHERE id = ? LIMIT 1", [id]);
  res.json({ ok: true, item: todoRowToItem(updated) });
});

// 删除待办
router.delete("/todos/:id", requireAuth, (req, res) => {
  const id = String(req.params.id || "");
  const existing = get("SELECT * FROM todos WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "待办不存在。" });
  }

  transaction(() => {
    runWrite("DELETE FROM todos WHERE id = ?", [id]);
  });

  res.json({ ok: true });
});

module.exports = router;
