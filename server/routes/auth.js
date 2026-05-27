const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  verifyPassword,
  createSession,
  destroySession,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  sessionToPayload,
  requireAuth,
} = require("../middleware/auth");
const { logServerEvent, logLoginFailure } = require("../utils/logger");
const db = require("../database/db");

const router = express.Router();

// 登录接口严格限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次登录尝试
  message: { error: "登录尝试次数过多,请15分钟后再试。" },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// 获取当前会话
router.get("/session", (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({ authenticated: false, user: null });
  }
  req.session = session;
  req.user = session.user;
  res.json(sessionToPayload(session));
});

// 登录
router.post("/login", loginLimiter, (req, res) => {
  const body = req.body || {};
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    logLoginFailure(req, username || "");
    return res.status(400).json({ error: "请输入用户名和密码。" });
  }

  const userRow = db.get("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
  if (!userRow || !verifyPassword(password, userRow)) {
    logLoginFailure(req, username);
    return res.status(401).json({ error: "用户名或密码不正确。" });
  }

  const session = createSession(userRow.id);
  setSessionCookie(req, res, session.token, session.expiresAt);
  const payload = {
    authenticated: true,
    user: {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
    },
    expiresAt: session.expiresAt,
  };

  logServerEvent("info", "login_success", {
    method: req.method,
    path: req.originalUrl || req.url,
    username: userRow.username,
    role: userRow.role,
    ip: req.ip,
  });

  res.json(payload);
});

// 登出
router.post("/logout", (req, res) => {
  const session = getSession(req);
  if (session) {
    destroySession(session.token);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// Bootstrap - 获取初始数据（需要认证）
router.get("/bootstrap", requireAuth, (req, res) => {
  // 这个路由将在 server.js 中实现，因为需要访问所有数据
  // 这里只是占位，实际实现在主路由汇总中
  res.status(501).json({ error: "此路由在主服务器中实现" });
});

module.exports = router;
