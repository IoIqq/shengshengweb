const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction, flushPersistSync } = require("../database");
const { setSetting } = require("../database/seed");

// 导入中间件
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { clientLogLimiter } = require("../middleware/rateLimiter");

// 导入工具函数
const { nowIso, nowLocalDateKey, randomId } = require("../utils/helpers");
const { createPasswordHash } = require("../utils/crypto");
const { logServerEvent } = require("../utils/logger");

// 导入服务
const { 
  buildBootstrap, 
  buildFullBackup, 
  getSettings 
} = require("../services/common");

// 导入配置
const config = require("../config");

// 辅助函数
function logActivity(title, meta, detail) {
  runWrite(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomId("act"), title, meta, detail, nowIso()],
  );
}

// API路由目录（需要从主应用传入）
let apiRouteCatalog = [];
function setApiRouteCatalog(catalog) {
  apiRouteCatalog = catalog;
}

function getRouteHealth() {
  return {
    apiRouteCount: apiRouteCatalog.length,
    criticalRoutes: {
      getDevices: apiRouteCatalog.includes("GET /api/devices"),
      getDeviceById: apiRouteCatalog.includes("GET /api/devices/:id"),
      deleteDevice: apiRouteCatalog.includes("DELETE /api/devices/:id"),
      getBorrowRequests: apiRouteCatalog.includes("GET /api/borrow-requests"),
      postBorrowRequests: apiRouteCatalog.includes("POST /api/borrow-requests"),
      getBorrowRequestById: apiRouteCatalog.includes("GET /api/borrow-requests/:id"),
      deleteMedia: apiRouteCatalog.includes("DELETE /api/media/:id"),
      bootstrap: apiRouteCatalog.includes("GET /api/bootstrap"),
      login: apiRouteCatalog.includes("POST /api/login"),
    },
  };
}

// ========== 系统路由 ==========

// 健康检查
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    timestamp: nowIso(),
    status: "running",
    nodeEnv: process.env.NODE_ENV || "development",
    port: config.PORT,
    host: config.HOST,
    databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, "/"),
    ...getRouteHealth(),
  });
});

// 路由列表
router.get("/routes", requireAuth, requireAdmin, (req, res) => {
  res.json({
    ok: true,
    ...getRouteHealth(),
    routes: apiRouteCatalog,
  });
});

// Bootstrap 数据
router.get("/bootstrap", requireAuth, (req, res) => {
  res.json(buildBootstrap(req.user));
});

// 完整备份
router.get("/backup", requireAuth, requireAdmin, (req, res) => {
  const payload = buildFullBackup();
  const filename = `backup-${nowLocalDateKey()}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(payload);
});

// 数据库备份
router.get("/backup/database", requireAuth, requireAdmin, (req, res) => {
  flushPersistSync().finally(() => {
    if (!fs.existsSync(config.DB_PATH)) {
      return res.status(404).json({ error: "数据库文件不存在。" });
    }
    const filename = `studio-${nowLocalDateKey()}.sqlite`;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(config.DB_PATH);
  });
});

// 获取设置
router.get("/settings", requireAuth, requireAdmin, (req, res) => {
  res.json(getSettings());
});

// 更新设置
router.patch("/settings", requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const siteTitle = String(body.siteTitle || "").trim();
  const siteSubtitle = String(body.siteSubtitle || "").trim();
  const homeHeroMessage = String(body.homeHeroMessage || "").trim();
  const publicUrl = String(body.publicUrl || "").trim();
  const adminUsername = String(body.adminUsername || "").trim();
  const adminPassword = String(body.adminPassword || "");

  transaction(() => {
    if (siteTitle) setSetting("siteTitle", siteTitle);
    if (siteSubtitle) setSetting("siteSubtitle", siteSubtitle);
    if (homeHeroMessage !== "") setSetting("homeHeroMessage", homeHeroMessage);
    if (publicUrl !== "") setSetting("publicUrl", publicUrl);
    if (adminUsername) {
      setSetting("adminUsername", adminUsername);
      const adminUser = get("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
      if (adminUser) {
        runWrite("UPDATE users SET username = ?, updated_at = ? WHERE id = ?", [adminUsername, nowIso(), adminUser.id]);
      }
    }
    if (adminPassword) {
      const adminUser = get("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
      if (adminUser) {
        const { salt, hash } = createPasswordHash(adminPassword);
        runWrite("UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?", [
          hash,
          salt,
          nowIso(),
          adminUser.id,
        ]);
      }
    }
    logActivity("站点设置更新", "管理员保存", "站点基础设置已更新。");
  });

  res.json({ ok: true, settings: getSettings() });
});

// 客户端日志
router.post("/client-log", clientLogLimiter, (req, res) => {
  const body = req.body || {};
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "client error";
  const category = typeof body.category === "string" ? body.category.slice(0, 80) : "client";
  logServerEvent("error", "client_log", {
    message,
    category,
    page: typeof body.page === "string" ? body.page.slice(0, 200) : req.get("referer") || "",
    payload: typeof body.payload === "object" && body.payload ? body.payload : {},
    userAgent: (req.get("user-agent") || "").slice(0, 200),
    role: req.user?.role || req.session?.user?.role || "guest",
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.setApiRouteCatalog = setApiRouteCatalog;
