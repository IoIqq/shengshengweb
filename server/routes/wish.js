const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { nowIso, randomId, normalizeSearchValue } = require("../utils/helpers");
const { logServerEvent } = require("../utils/logger");
const db = require("../database/db");

const router = express.Router();

function wishRowToItem(row) {
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    mood: row.mood || "",
    anonymous: Boolean(row.anonymous),
    createdAt: row.created_at,
  };
}

// 获取所有留言
router.get("/", requireAuth, (req, res) => {
  try {
    const search = normalizeSearchValue(req.query.search || req.query.q || "");
    let sql = "SELECT * FROM wishes ORDER BY datetime(created_at) DESC";
    const params = [];

    if (search) {
      sql = `SELECT * FROM wishes 
             WHERE LOWER(COALESCE(content, '')) LIKE ? 
                OR LOWER(COALESCE(author, '')) LIKE ? 
                OR LOWER(COALESCE(mood, '')) LIKE ?
             ORDER BY datetime(created_at) DESC`;
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }

    const items = db.all(sql, params).map(wishRowToItem);
    res.json({ ok: true, items });
  } catch (error) {
    logServerEvent("error", "wish_list_failed", { error });
    res.status(500).json({ error: "获取留言失败。" });
  }
});

// 创建新留言
router.post("/", requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const content = String(body.content || "").trim();
    const mood = String(body.mood || "").trim();
    const anonymous = Boolean(body.anonymous);

    if (!content) {
      return res.status(400).json({ error: "请输入留言内容。" });
    }

    if (content.length > 200) {
      return res.status(400).json({ error: "留言内容不能超过200字。" });
    }

    const author = anonymous ? "匿名" : (req.user?.username || "未知用户");
    const item = {
      id: randomId("wish"),
      content,
      author,
      mood,
      anonymous: anonymous ? 1 : 0,
      created_at: nowIso(),
    };

    db.transaction(() => {
      db.runWrite(
        `INSERT INTO wishes (id, content, author, mood, anonymous, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.content, item.author, item.mood, item.anonymous, item.created_at],
      );
    });

    logServerEvent("info", "wish_created", {
      wishId: item.id,
      author: req.user?.username || "unknown",
      anonymous,
    });

    res.json({ ok: true, item: wishRowToItem(item) });
  } catch (error) {
    logServerEvent("error", "wish_create_failed", { error });
    res.status(500).json({ error: "创建留言失败。" });
  }
});

// 删除留言（仅管理员或留言作者）
router.delete("/:id", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || "");
    const existing = db.get("SELECT * FROM wishes WHERE id = ? LIMIT 1", [id]);

    if (!existing) {
      return res.status(404).json({ error: "留言不存在。" });
    }

    // 检查权限：管理员或留言作者（非匿名且用户名匹配）
    const isAdmin = req.user?.role === "admin";
    const isAuthor = !existing.anonymous && existing.author === req.user?.username;

    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ error: "无权删除此留言。" });
    }

    db.transaction(() => {
      db.runWrite("DELETE FROM wishes WHERE id = ?", [id]);
    });

    logServerEvent("info", "wish_deleted", {
      wishId: id,
      deletedBy: req.user?.username || "unknown",
    });

    res.json({ ok: true });
  } catch (error) {
    logServerEvent("error", "wish_delete_failed", { error });
    res.status(500).json({ error: "删除留言失败。" });
  }
});

module.exports = router;
