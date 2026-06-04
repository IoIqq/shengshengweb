aconst express = require("express");
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction, all } = require("../database");

// 导入中间件
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { teamWriteLimiter } = require("../middleware/rateLimiter");

// 导入工具函数
const { nowIso, randomId } = require("../utils/helpers");

// 导入服务
const { teamRowToItem } = require("../services/common");

// ========== 团队路由 ==========

// 获取团队成员列表（通过 bootstrap 返回，这里保留接口以备扩展）
router.get("/team", requireAuth, (req, res) => {
  const items = all("SELECT * FROM team ORDER BY order_index ASC, datetime(created_at) ASC")
    .map(teamRowToItem);
  res.json({ ok: true, items });
});

// 添加团队成员
router.post("/team", teamWriteLimiter, requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const role = String(body.role || "").trim();
  const note = String(body.note || "").trim();
  const badge = String(body.badge || "").trim().slice(0, 2);
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const status = String(body.status || "active");
  const joinedAt = String(body.joinedAt || nowIso());
  if (!name || !role) {
    return res.status(400).json({ error: "请输入成员姓名和角色。" });
  }

  const maxOrder = get("SELECT MAX(order_index) AS max FROM team");
  const nextOrder = (maxOrder?.max || 0) + 1;

  const item = {
    id: randomId("team"),
    name,
    role,
    note,
    badge: badge || name.slice(0, 1),
    email,
    phone,
    status: ["active", "inactive"].includes(status) ? status : "active",
    joined_at: joinedAt,
    order_index: nextOrder,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  transaction(() => {
    runWrite(
      `INSERT INTO team (id, name, role, note, badge, email, phone, status, joined_at, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.name, item.role, item.note, item.badge, item.email, item.phone, item.status, item.joined_at, item.order_index, item.created_at, item.updated_at],
    );
  });
  res.json({ ok: true, item: teamRowToItem(item) });
});

// 更新团队成员
router.patch("/team/:id", teamWriteLimiter, requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || "");
  const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "成员不存在。" });
  }

  const body = req.body || {};
  const name = body.name !== undefined ? String(body.name || "").trim() : existing.name;
  const role = body.role !== undefined ? String(body.role || "").trim() : existing.role;
  const note = body.note !== undefined ? String(body.note || "").trim() : existing.note;
  const badge = body.badge !== undefined ? String(body.badge || "").trim().slice(0, 2) : existing.badge;
  const email = body.email !== undefined ? String(body.email || "").trim() : existing.email;
  const phone = body.phone !== undefined ? String(body.phone || "").trim() : existing.phone;
  const status = body.status !== undefined ? String(body.status || "").trim() : existing.status;
  const joinedAt = body.joinedAt !== undefined ? String(body.joinedAt || "").trim() : existing.joined_at;
  const nextStatus = ["active", "inactive"].includes(status) ? status : existing.status;

  transaction(() => {
    runWrite(
      `UPDATE team
       SET name = ?, role = ?, note = ?, badge = ?, email = ?, phone = ?, status = ?, joined_at = ?, updated_at = ?
       WHERE id = ?`,
      [name, role, note, badge, email, phone, nextStatus, joinedAt, nowIso(), id],
    );
  });

  const updated = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
  res.json({ ok: true, item: teamRowToItem(updated) });
});

// 删除团队成员
router.delete("/team/:id", teamWriteLimiter, requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || "");
  const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "成员不存在。" });
  }

  transaction(() => {
    runWrite("DELETE FROM team WHERE id = ?", [id]);
  });

  res.json({ ok: true });
});

// 调整成员顺序
router.patch("/team/:id/order", teamWriteLimiter, requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || "");
  const body = req.body || {};
  const newOrder = Number(body.orderIndex);
  if (!Number.isInteger(newOrder) || newOrder < 1) {
    return res.status(400).json({ error: "顺序值必须是正整数。" });
  }

  const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "成员不存在。" });
  }

  transaction(() => {
    const oldOrder = existing.order_index;
    if (newOrder === oldOrder) return;

    if (newOrder < oldOrder) {
      runWrite(
        "UPDATE team SET order_index = order_index + 1 WHERE order_index >= ? AND order_index < ?",
        [newOrder, oldOrder],
      );
    } else {
      runWrite(
        "UPDATE team SET order_index = order_index - 1 WHERE order_index > ? AND order_index <= ?",
        [oldOrder, newOrder],
      );
    }
    runWrite("UPDATE team SET order_index = ?, updated_at = ? WHERE id = ?", [newOrder, nowIso(), id]);
  });

  const items = all("SELECT * FROM team ORDER BY order_index ASC, datetime(created_at) ASC")
    .map(teamRowToItem);
  res.json({ ok: true, items });
});

module.exports = router;
