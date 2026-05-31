const express = require("express");
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction, all } = require("../database");

// 导入中间件
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { wishLimiter } = require("../middleware/rateLimiter");

// 导入工具函数
const { nowIso, randomId } = require("../utils/helpers");

// 导入服务
const { wishRowToItem } = require("../services/common");

// ========== 留言墙路由 ==========

// 获取留言列表
router.get("/wishes", (req, res) => {
  const items = all("SELECT * FROM wishes ORDER BY datetime(created_at) DESC")
    .map(wishRowToItem);
  res.json({ ok: true, items });
});

// 发布留言
router.post("/wishes", wishLimiter, (req, res) => {
  const body = req.body || {};
  const content = String(body.content || "").trim();
  const author = String(body.author || "").trim();
  const mood = String(body.mood || "").trim();
  const anonymous = Boolean(body.anonymous);
  if (!content) {
    return res.status(400).json({ error: "请输入留言内容。" });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: "留言内容不能超过 500 字。" });
  }
  if (!author && !anonymous) {
    return res.status(400).json({ error: "请输入署名或选择匿名。" });
  }

  const item = {
    id: randomId("wish"),
    content,
    author: anonymous ? "匿名" : author,
    mood: mood || "",
    anonymous: anonymous ? 1 : 0,
    created_at: nowIso(),
  };
  transaction(() => {
    runWrite(
      `INSERT INTO wishes (id, content, author, mood, anonymous, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, item.content, item.author, item.mood, item.anonymous, item.created_at],
    );
  });
  res.json({ ok: true, item: wishRowToItem(item) });
});

// 删除留言
router.delete("/wishes/:id", requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || "");
  const existing = get("SELECT * FROM wishes WHERE id = ? LIMIT 1", [id]);
  if (!existing) {
    return res.status(404).json({ error: "留言不存在。" });
  }

  transaction(() => {
    runWrite("DELETE FROM wishes WHERE id = ?", [id]);
  });

  res.json({ ok: true });
});

module.exports = router;
