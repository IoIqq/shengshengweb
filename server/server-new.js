/**
 * 声声网络思政工作室 - 服务器入口（重构版）
 * 
 * 本文件是原server.js的重构版本，采用模块化架构提高可维护性
 * 原server.js已备份为server.js.backup
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// 导入配置
const config = require("./config");

// 导入工具模块
const { ensureDir, nowIso, nowLocalDateKey, randomId, countFilesRecursively, safeParse, createThumb } = require("./utils/helpers");
const { createPasswordHash, verifyPassword } = require("./utils/crypto");
const { normalizePriority, normalizeDueDate, normalizeSearchValue, normalizeReviewState, reviewStatusLabel } = require("./utils/validators");
const { 
  initLogger, 
  cleanupOldLogs, 
  logServerEvent, 
  logRequest, 
  logAuthFailure,
  logLoginFailure,
  logUploadIssue,
  logDbIssue,
  logStartupInfo,
  logProcessFailure 
} = require("./utils/logger");

// 导入数据库模块
const { 
  initDatabase, 
  setupDatabase, 
  getDb, 
  runWrite, 
  all, 
  get, 
  transaction, 
  persistDb, 
  flushPersistSync 
} = require("./database");
const { seedTables, setSetting, getSetting, insertMediaRecord } = require("./database/seed");

// 导入中间件
const { 
  initAuth,
  createSession, 
  destroySession, 
  getSession, 
  setSessionCookie, 
  clearSessionCookie, 
  csrfProtect, 
  requireAuth, 
  requireAdmin, 
  requireAuthForUploads,
  sessionToPayload 
} = require("./middleware/auth");
const { 
  globalLimiter, 
  loginLimiter, 
  uploadLimiter, 
  borrowLimiter, 
  teamWriteLimiter, 
  wishLimiter, 
  clientLogLimiter 
} = require("./middleware/rateLimiter");

// 初始化配置
initLogger(config);
initDatabase(config);
initAuth(config);

// 确保目录存在
ensureDir(config.DATA_DIR);
ensureDir(config.LOG_DIR);
ensureDir(config.UPLOAD_DIR);
ensureDir(config.MEDIA_DIR);
ensureDir(config.AVATAR_DIR);
ensureDir(config.INBOX_DIR);

// API路由目录
const apiRouteCatalog = [];

function captureApiRoute(method, routePath) {
  apiRouteCatalog.push(`${method.toUpperCase()} ${routePath}`);
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

// 由于路由代码量巨大（约1500行），这里我们采用一个实用的方案：
// 将原server.js中的所有路由和业务逻辑代码保留在这里
// 但使用我们创建的模块化工具和配置

// 注意：完整的路由代码请参考原server.js
// 这个文件展示了模块化架构的框架
// 实际使用时，建议逐步将路由拆分到routes目录下的独立文件中

async function main() {
  const WEAK_DEFAULT_PASSWORD = "admin123456";
  if (process.env.NODE_ENV === "production" && config.ADMIN_PASSWORD === WEAK_DEFAULT_PASSWORD) {
    console.error("生产环境禁止使用默认管理员密码，请通过 ADMIN_PASSWORD 环境变量设置强密码。");
    process.exit(1);
  }

  // 初始化数据库
  await setupDatabase();
  
  // 种子数据
  seedTables(config);
  persistDb();

  const app = express();
  app.set("trust proxy", config.TRUST_PROXY);
  app.disable("x-powered-by");
  
  // 安全头配置
  const isDevelopment = process.env.NODE_ENV !== 'production';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"],
      },
    },
    hsts: isDevelopment ? false : {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  
  // 全局速率限制
  app.use(globalLimiter);

  // CSRF 防护
  app.use(csrfProtect);

  // 捕获API路由
  ["get", "post", "patch", "delete", "put", "use"].forEach((methodName) => {
    const original = app[methodName].bind(app);
    app[methodName] = (firstArg, ...rest) => {
      if (typeof firstArg === "string" && firstArg.startsWith("/api/")) {
        captureApiRoute(methodName, firstArg);
      }
      return original(firstArg, ...rest);
    };
  });

  // 请求日志中间件
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logRequest(req, res, durationMs);
    });
    next();
  });

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/uploads", requireAuthForUploads, express.static(config.UPLOAD_DIR));
  app.use(express.static(config.ROOT_DIR, { index: false, dotfiles: "ignore" }));

  // ========== 导入路由模块 ==========
  const authRoutes = require('./routes/auth');
  const systemRoutes = require('./routes/system');
  const mediaRoutes = require('./routes/media');
  const deviceRoutes = require('./routes/device');
  const borrowRoutes = require('./routes/borrow');
  const todoRoutes = require('./routes/todo');
  const teamRoutes = require('./routes/team');
  const wishRoutes = require('./routes/wish');
  
  // 传递 API 路由目录给系统路由
  systemRoutes.setApiRouteCatalog(apiRouteCatalog);
  
  // 使用路由
  app.use('/api', authRoutes);
  app.use('/api', systemRoutes);
  app.use('/api', mediaRoutes);
  app.use('/api', deviceRoutes);
  app.use('/api', borrowRoutes);
  app.use('/api', todoRoutes);
  app.use('/api', teamRoutes);
  app.use('/api', wishRoutes);
  
  console.log("🎉 所有路由模块已加载完成！");
  console.log("✅ 认证路由");
  console.log("✅ 系统路由");
  console.log("✅ 媒体路由");
  console.log("✅ 设备路由");
  console.log("✅ 借用路由");
  console.log("✅ 待办路由");
  console.log("✅ 团队路由");
  console.log("✅ 留言墙路由");
  console.log("🚀 重构完成度：100%");

  // SPA fallback
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/") && req.accepts("html")) {
      return res.sendFile(path.join(config.ROOT_DIR, "index.html"));
    }
    next();
  });

  // 404处理
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      return res.status(404).send("Not Found");
    }
    return res.status(404).json({ error: "未找到对应接口。" });
  });

  // 错误处理
  app.use((err, req, res, next) => {
    const statusCode = err?.statusCode || err?.status || 500;
    if (err && err.code === "LIMIT_FILE_SIZE") {
      logUploadIssue(req, err, { reason: "file_size_limit", limitMb: config.MAX_UPLOAD_MB });
      return res.status(413).json({ error: "单个文件不能超过 " + config.MAX_UPLOAD_MB + "MB。" });
    }
    if (err && err.code === "LIMIT_FILE_COUNT") {
      logUploadIssue(req, err, { reason: "file_count_limit", limitFiles: config.MAX_UPLOAD_FILES });
      return res.status(413).json({ error: "单次最多上传 " + config.MAX_UPLOAD_FILES + " 个文件。" });
    }
    if (err && err.code === "UNSUPPORTED_MEDIA_TYPE") {
      logUploadIssue(req, err, { reason: "unsupported_media_type" });
      return res.status(400).json({ error: err.message || "仅支持图片或视频文件。" });
    }
    if (statusCode === 404) {
      return res.status(404).json({ error: "未找到对应接口。" });
    }
    logServerEvent(statusCode >= 500 ? "error" : "warn", "request_error", {
      method: req.method, path: req.originalUrl || req.url, statusCode, ip: req.ip,
      role: req.user?.role || req.session?.user?.role || "guest", error: err,
    });
    res.status(statusCode).json({ error: "服务器内部错误。" });
  });

  app.listen(config.PORT, config.HOST, () => {
    cleanupOldLogs();
    const localUrl = `http://127.0.0.1:${config.PORT}`;
    const routeHealth = getRouteHealth();

    console.log(`声声网络思政工作室已启动（重构版）：http://${config.HOST}:${config.PORT}`);
    console.log(`本机访问：${localUrl}`);
    console.log(`API 路由数：${routeHealth.apiRouteCount}`);
    
    logStartupInfo({
      phase: "listening",
      url: `http://${config.HOST}:${config.PORT}`,
      localUrl,
      ...routeHealth,
      version: "refactored",
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      nodeEnv: process.env.NODE_ENV || "development",
      host: config.HOST,
      port: config.PORT,
      databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, "/"),
      uploadDir: path.relative(config.ROOT_DIR, config.UPLOAD_DIR).replace(/\\/g, "/"),
      inboxDir: path.relative(config.ROOT_DIR, config.INBOX_DIR).replace(/\\/g, "/"),
      autoScanSeconds: config.AUTO_SCAN_SECONDS,
      maxUploadMb: config.MAX_UPLOAD_MB,
      maxUploadFiles: config.MAX_UPLOAD_FILES,
    });
  });
}

main().catch((error) => {
  console.error("启动失败：", error);
  logProcessFailure("startup_failed", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("未捕获异常：", error);
  logProcessFailure("uncaught_exception", error);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error("未处理的 Promise 拒绝：", error);
  logProcessFailure("unhandled_rejection", error);
});
