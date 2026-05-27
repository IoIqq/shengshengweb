const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const initSqlJs = require("sql.js");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

dotenv.config();

const ROOT_DIR = path.join(__dirname, "..");

// 支持绝对路径和相对路径的路径解析函数
function resolvePath(envPath, defaultPath) {
  if (!envPath) return defaultPath;
  // 如果是绝对路径（Windows: C:\ 或 D:\, Unix: /）
  if (path.isAbsolute(envPath)) {
    return path.normalize(envPath);
  }
  // 相对路径，相对于项目根目录
  return path.resolve(ROOT_DIR, envPath);
}

const DATA_DIR = resolvePath(null, path.join(__dirname, "data"));
const LOG_DIR = resolvePath(null, path.join(__dirname, "logs"));
const UPLOAD_DIR = resolvePath(process.env.UPLOAD_DIR, path.join(__dirname, "uploads"));
const MEDIA_DIR = path.join(UPLOAD_DIR, "media");
const INBOX_DIR = resolvePath(process.env.INBOX_DIR, path.join(UPLOAD_DIR, "inbox"));
const DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(DATA_DIR, "studio.sqlite"));
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 72);
const TRUST_PROXY = String(process.env.TRUST_PROXY || "1") !== "0";
const AUTO_SCAN_SECONDS = Number(process.env.INBOX_AUTO_SCAN_SECONDS || 60);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 30);
const SITE_TITLE = process.env.SITE_TITLE || "思想工作台";
const SITE_SUBTITLE = process.env.SITE_SUBTITLE || "可落盘的排障与协作中心";
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const SESSION_COOKIE = "ss_sid";
let db = null;
const apiRouteCatalog = [];

ensureDir(DATA_DIR);
ensureDir(LOG_DIR);
ensureDir(UPLOAD_DIR);
ensureDir(MEDIA_DIR);
ensureDir(INBOX_DIR);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function nowLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatErrorForLog(error) {
  if (!error) {
    return { message: "Unknown error" };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  const payload = {
    name: error.name || "Error",
    message: error.message || String(error),
  };
  if (error.code !== undefined) payload.code = error.code;
  if (error.errno !== undefined) payload.errno = error.errno;
  if (error.status !== undefined) payload.status = error.status;
  if (error.statusCode !== undefined) payload.statusCode = error.statusCode;
  if (error.stack) payload.stack = error.stack;
  return payload;
}

function serializeLogValue(value) {
  if (value instanceof Error) {
    return formatErrorForLog(value);
  }
  if (Array.isArray(value)) {
    return value.map(serializeLogValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeLogValue(entry)]),
    );
  }
  return value;
}

function appendServerLog(level, event, details = {}) {
  const line = JSON.stringify({
    timestamp: nowIso(),
    level,
    event,
    ...serializeLogValue(details),
  });
  const filePath = path.join(LOG_DIR, `${nowLocalDateKey()}.log`);
  try {
    fs.appendFileSync(filePath, `${line}\n`);
  } catch (error) {
    console.error("日志写入失败：", error);
  }
}

function logServerEvent(level, event, details = {}) {
  appendServerLog(level, event, details);
}

function logRequest(req, res, durationMs) {
  logServerEvent("info", "http_request", {
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs: Number(durationMs.toFixed(2)),
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
  });
}

function logAuthFailure(req, reason, details = {}) {
  logServerEvent("warn", "auth_failure", {
    reason,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
    ...details,
  });
}

function logLoginFailure(req, username) {
  logServerEvent("warn", "login_failure", {
    username,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
  });
}

function logUploadIssue(req, error, details = {}) {
  logServerEvent("error", "upload_error", {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
    error,
    ...details,
  });
}

function logDbIssue(event, error, details = {}) {
  logServerEvent("error", event, {
    error,
    ...details,
  });
}

function logStartupInfo(extra = {}) {
  logServerEvent("info", "startup", {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    nodeEnv: process.env.NODE_ENV || "development",
    host: HOST,
    port: PORT,
    databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
    uploadDir: path.relative(ROOT_DIR, UPLOAD_DIR).replace(/\\/g, "/"),
    inboxDir: path.relative(ROOT_DIR, INBOX_DIR).replace(/\\/g, "/"),
    autoScanSeconds: AUTO_SCAN_SECONDS,
    maxUploadMb: MAX_UPLOAD_MB,
    maxUploadFiles: MAX_UPLOAD_FILES,
    ...extra,
  });
}

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
      bootstrap: apiRouteCatalog.includes("GET /api/bootstrap"),
      login: apiRouteCatalog.includes("POST /api/login"),
    },
  };
}

function logProcessFailure(type, error) {
  logServerEvent("fatal", type, {
    error,
    pid: process.pid,
    nodeVersion: process.version,
  });
}

function getLanIpAddresses() {
  const seen = new Set();
  const addresses = [];

  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (!info || info.family !== "IPv4" || info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      addresses.push(info.address);
    }
  }

  return addresses.sort((left, right) => left.localeCompare(right));
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createThumb(label, colorA, colorB, kind) {
  const icon =
    kind === "video"
      ? `<rect x="23" y="18" width="50" height="36" rx="8" fill="rgba(255,255,255,0.14)"/><polygon points="44,26 44,46 60,36" fill="#fffdf6"/>`
      : `<circle cx="31" cy="26" r="6" fill="#fffdf6"/><path d="M8 58l18-18 12 11 12-14 18 21H8Z" fill="rgba(255,255,255,0.85)"/>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorA}" />
          <stop offset="100%" stop-color="${colorB}" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="28" fill="url(#g)" />
      <g opacity="0.18" fill="#fffdf6">
        <circle cx="270" cy="58" r="54" />
        <circle cx="70" cy="165" r="42" />
      </g>
      ${icon}
      <text x="26" y="166" fill="#fffdf6" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="22" font-weight="700">${escapeXml(
        label,
      )}</text>
      <text x="26" y="186" fill="rgba(255,255,255,0.82)" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="12">声声网络思政工作室</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function defaultTeam() {
  const now = nowIso();
  return [
    {
      id: "team-1",
      name: "林晓妍",
      role: "内容统筹",
      note: "负责选题、审片和发布节奏",
      badge: "统",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 1,
    },
    {
      id: "team-2",
      name: "周浩然",
      role: "视频剪辑",
      note: "负责短视频包装和节奏优化",
      badge: "剪",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 2,
    },
    {
      id: "team-3",
      name: "陈佳宁",
      role: "视觉设计",
      note: "负责海报、封面和版式统一",
      badge: "设",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 3,
    },
    {
      id: "team-4",
      name: "宋思雨",
      role: "摄影采访",
      note: "负责现场拍摄与素材归档",
      badge: "摄",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 4,
    },
  ];
}

function defaultTodos() {
  return [
    { id: "todo-1", title: "确认下一期推文封面风格", priority: "高", done: false },
    { id: "todo-2", title: "整理服务器照片目录命名", priority: "中", done: false },
    { id: "todo-3", title: "补拍团课活动 3 张横版图", priority: "高", done: false },
    { id: "todo-4", title: "给视频片头统一片尾片头", priority: "低", done: true },
  ];
}

function defaultActivity() {
  return [
    {
      id: "act-1",
      title: "校园宣传片",
      meta: "已通过 · 3 分钟前 · 审片人：林晓然",
      detail: "进入发布排期，建议同步到公众号与视频号。",
      createdAt: nowIso(),
    },
    {
      id: "act-2",
      title: "采访现场组图",
      meta: "待审 · 18 分钟前 · 来自服务器照片",
      detail: "已同步到素材库，等待补拍特写。",
      createdAt: nowIso(),
    },
    {
      id: "act-3",
      title: "新生报到短视频",
      meta: "退回 · 35 分钟前 · 需要再剪一版",
      detail: "建议缩短片头和字幕停留时间。",
      createdAt: nowIso(),
    },
  ];
}

function defaultMedia() {
  return [
    {
      id: "media-1",
      kind: "photo",
      title: "团课封面：青春与信仰",
      source: "服务器 / 公众号 / 2026-05-18",
      source_type: "seed",
      source_path: null,
      author: "晓然",
      duration: "5184 × 3456",
      status: "待审",
      note: "封面图需要统一压暗一点，标题往左上挪，留白更足。",
      tags_json: JSON.stringify(["封面", "团课", "公众号"]),
      thumb: createThumb("团课封面", "#1f5a49", "#f6c453", "photo"),
      url: createThumb("团课封面", "#1f5a49", "#f6c453", "photo"),
      review_state: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-2",
      kind: "video",
      title: "开学季短视频：新生报到",
      source: "服务器 / 视频素材 / 2026-05-18",
      source_type: "seed",
      source_path: null,
      author: "浩然",
      duration: "02:16",
      status: "待审",
      note: "需要再核对字幕节奏，结尾 logo 放大 5%。",
      tags_json: JSON.stringify(["短视频", "开学季", "剪辑"]),
      thumb: createThumb("新生报到", "#163d32", "#ef6c4e", "video"),
      url: createThumb("新生报到", "#163d32", "#ef6c4e", "video"),
      review_state: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-3",
      kind: "photo",
      title: "思政主题海报出图",
      source: "服务器 / 平面设计 / 2026-05-17",
      source_type: "seed",
      source_path: null,
      author: "佳宁",
      duration: "4096 × 4096",
      status: "已通过",
      note: "构图稳定，颜色统一，适合直接投放。",
      tags_json: JSON.stringify(["海报", "平面", "投放"]),
      thumb: createThumb("主题海报", "#ef6c4e", "#fff0d1", "photo"),
      url: createThumb("主题海报", "#ef6c4e", "#fff0d1", "photo"),
      review_state: "approved",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-4",
      kind: "video",
      title: "访谈片头：老师讲思政",
      source: "服务器 / 访谈 / 2026-05-16",
      source_type: "seed",
      source_path: null,
      author: "子突",
      duration: "01:04",
      status: "退回",
      note: "片头可更快进入主题，降低标题停留时间。",
      tags_json: JSON.stringify(["访谈", "栏目", "修改"]),
      thumb: createThumb("老师访谈", "#4a8b3b", "#e2f0d9", "video"),
      url: createThumb("老师访谈", "#4a8b3b", "#e2f0d9", "video"),
      review_state: "rejected",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function setSetting(key, value) {
  runWrite(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? "")],
  );
}

function getSetting(key, fallback = "") {
  const row = get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, row) {
  if (!row) return false;
  const hash = crypto.scryptSync(String(password), row.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.password_hash, "hex"));
}

function createAdminUser(username, password) {
  const { salt, hash } = createPasswordHash(password || "admin123456");
  const now = nowIso();
  runWrite(
    `INSERT INTO users (username, password_hash, salt, role, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', ?, ?)`,
    [username, hash, salt, now, now],
  );
}

function cleanupSessions() {
  runWrite("DELETE FROM sessions WHERE expires_at <= ?", [nowIso()]);
}

function createSession(userId) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  runWrite(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, expiresAt, nowIso()],
  );
  persistDb();
  return { token, expiresAt };
}

function destroySession(token) {
  if (!token) return;
  runWrite("DELETE FROM sessions WHERE token = ?", [token]);
  persistDb();
}

function parseCookies(header) {
  return header.split(";").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function cleanupExpiredSessionState() {
  cleanupSessions();
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  cleanupExpiredSessionState();
  const row = get(
    `SELECT sessions.token, sessions.expires_at, users.id AS user_id, users.username, users.role
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`,
    [token, nowIso()],
  );
  if (!row) return null;
  return {
    token: row.token,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
    },
  };
}

function shouldUseSecureCookie(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.get("x-forwarded-proto") || "").toLowerCase();
  return forwardedProto.split(",")[0].trim() === "https";
}

function setSessionCookie(req, res, token, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  const secureFlag = shouldUseSecureCookie(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
  );
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    logAuthFailure(req, "unauthorized");
    return res.status(401).json({ error: "请先登录。" });
  }
  req.session = session;
  req.user = session.user;
  next();
}

function normalizePriority(value) {
  if (value === "高" || value === "中" || value === "低") return value;
  return "中";
}

function normalizeReviewState(value) {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  return "pending";
}

function reviewStatusLabel(state) {
  if (state === "approved") return "已通过";
  if (state === "rejected") return "退回";
  return "待审";
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function mediaRowToItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    source: row.source,
    author: row.author,
    duration: row.duration,
    status: row.status,
    note: row.note,
    tags: safeParse(row.tags_json, []),
    thumb: row.thumb,
    url: row.url,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deviceRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    assetNo: row.asset_no,
    status: row.status,
    location: row.location,
    owner: row.owner,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function borrowRequestRowToItem(row) {
  return {
    id: row.id,
    applicant: row.applicant,
    deviceId: row.device_id,
    deviceName: row.device_name,
    purpose: row.purpose,
    borrowAt: row.borrow_at,
    expectedReturnAt: row.expected_return_at,
    note: row.note,
    status: row.status,
    returnStatus: row.return_status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    returnedAt: row.returned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function todoRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    done: Boolean(row.done),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function activityRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    meta: row.meta,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function teamRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    note: row.note,
    badge: row.badge,
    email: row.email || "",
    phone: row.phone || "",
    status: row.status || "active",
    joinedAt: row.joined_at || "",
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim();
}

function buildSearchClause(columns, term, params) {
  const search = normalizeSearchValue(term);
  if (!search) return "";
  const like = `%${search.toLowerCase()}%`;
  params.push(...columns.map(() => like));
  return `(${columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(" OR ")})`;
}

function getDeviceList(filters = {}) {
  const clauses = [];
  const params = [];
  const searchClause = buildSearchClause(
    ["name", "category", "asset_no", "location", "owner", "note"],
    filters.search || filters.q,
    params,
  );
  if (searchClause) clauses.push(searchClause);

  const status = normalizeSearchValue(filters.status);
  if (status && status !== "all") {
    clauses.push("status = ?");
    params.push(status);
  }

  const category = normalizeSearchValue(filters.category);
  if (category) {
    clauses.push("LOWER(COALESCE(category, '')) LIKE ?");
    params.push(`%${category.toLowerCase()}%`);
  }

  const owner = normalizeSearchValue(filters.owner);
  if (owner) {
    clauses.push("LOWER(COALESCE(owner, '')) LIKE ?");
    params.push(`%${owner.toLowerCase()}%`);
  }

  const assetNo = normalizeSearchValue(filters.assetNo);
  if (assetNo) {
    clauses.push("LOWER(COALESCE(asset_no, '')) LIKE ?");
    params.push(`%${assetNo.toLowerCase()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(`SELECT * FROM devices ${where} ORDER BY datetime(created_at) DESC`, params).map(deviceRowToItem);
}

function getDeviceById(id) {
  return get("SELECT * FROM devices WHERE id = ? LIMIT 1", [id]);
}

function getBorrowRequestList(filters = {}) {
  const clauses = [];
  const params = [];
  const searchClause = buildSearchClause(
    ["borrow_requests.applicant", "borrow_requests.purpose", "borrow_requests.note", "borrow_requests.device_id", "borrow_requests.approved_by", "borrow_requests.status", "borrow_requests.return_status", "devices.name"],
    filters.search || filters.q,
    params,
  );
  if (searchClause) clauses.push(searchClause);

  const status = normalizeSearchValue(filters.status);
  if (status && status !== "all") {
    if (status === "returned") {
      clauses.push("borrow_requests.return_status = 'returned'");
    } else {
      clauses.push("borrow_requests.status = ?");
      params.push(status);
    }
  }

  const deviceId = normalizeSearchValue(filters.deviceId);
  if (deviceId) {
    clauses.push("borrow_requests.device_id = ?");
    params.push(deviceId);
  }

  const applicant = normalizeSearchValue(filters.applicant);
  if (applicant) {
    clauses.push("LOWER(COALESCE(borrow_requests.applicant, '')) LIKE ?");
    params.push(`%${applicant.toLowerCase()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(
    `
    SELECT borrow_requests.*, devices.name AS device_name
    FROM borrow_requests
    LEFT JOIN devices ON devices.id = borrow_requests.device_id
    ${where}
    ORDER BY datetime(borrow_requests.created_at) DESC
  `,
    params,
  ).map(borrowRequestRowToItem);
}

function getBorrowRequestById(id) {
  return get(
    `
    SELECT borrow_requests.*, devices.name AS device_name
    FROM borrow_requests
    LEFT JOIN devices ON devices.id = borrow_requests.device_id
    WHERE borrow_requests.id = ? LIMIT 1
  `,
    [id],
  );
}

function getAllMedia() {
  return all("SELECT * FROM media ORDER BY datetime(created_at) DESC").map(mediaRowToItem);
}

function getAllTodos() {
  return all("SELECT * FROM todos ORDER BY datetime(created_at) DESC").map(todoRowToItem);
}

function getAllActivity() {
  return all("SELECT * FROM activity ORDER BY datetime(created_at) DESC").map(activityRowToItem);
}

function getAllTeam() {
  return all("SELECT * FROM team ORDER BY order_index ASC, datetime(created_at) ASC").map(teamRowToItem);
}

function getAllDevices() {
  return getDeviceList();
}

function getAllBorrowRequests() {
  return getBorrowRequestList();
}

function getDashboard() {
  const deviceCount = get("SELECT COUNT(*) AS count FROM devices").count;
  const borrowOpenCount = get("SELECT COUNT(*) AS count FROM borrow_requests WHERE status = 'pending'").count;
  return {
    counts: {
      all: get("SELECT COUNT(*) AS count FROM media").count,
      pending: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'pending'").count,
      approved: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'approved'").count,
      photo: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'photo'").count,
      video: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'video'").count,
      todoOpen: get("SELECT COUNT(*) AS count FROM todos WHERE done = 0").count,
      devices: deviceCount,
      borrowOpen: borrowOpenCount,
    },
    recent: all("SELECT * FROM activity ORDER BY datetime(created_at) DESC LIMIT 8").map(activityRowToItem),
    syncMessage: getSetting("syncMessage", "等待同步"),
    lastSyncAt: getSetting("lastSyncAt", ""),
  };
}

function getSettings() {
  return {
    siteTitle: getSetting("siteTitle", SITE_TITLE),
    siteSubtitle: getSetting("siteSubtitle", SITE_SUBTITLE),
    homeHeroMessage: getSetting("homeHeroMessage", "首页只保留最关键的摘要，方便快速进入工作状态。"),
    publicUrl: getSetting("publicUrl", PUBLIC_URL),
    adminUsername: getSetting("adminUsername", ADMIN_USERNAME),
    syncMessage: getSetting("syncMessage", "等待同步"),
    lastSyncAt: getSetting("lastSyncAt", ""),
  };
}

function getSystemInfo() {
  return {
    databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
    uploadDir: "server/uploads",
    inboxDir: "server/uploads/inbox",
    inboxAutoScanSeconds: AUTO_SCAN_SECONDS,
    maxUploadMb: MAX_UPLOAD_MB,
  };
}

function buildBootstrap(user) {
  return {
    user,
    publicConfig: {
      siteTitle: getSetting("siteTitle", SITE_TITLE),
      siteSubtitle: getSetting("siteSubtitle", SITE_SUBTITLE),
      homeHeroMessage: getSetting("homeHeroMessage", "首页只保留最关键的摘要，方便快速进入工作状态。"),
      publicUrl: getSetting("publicUrl", PUBLIC_URL),
    },
    site: {
      title: getSetting("siteTitle", SITE_TITLE),
      subtitle: getSetting("siteSubtitle", SITE_SUBTITLE),
      homeHeroMessage: getSetting("homeHeroMessage", "首页只保留最关键的摘要，方便快速进入工作状态。"),
    },
    system: getSystemInfo(),
    settings: getSettings(),
    dashboard: getDashboard(),
    media: getAllMedia(),
    todos: getAllTodos(),
    activity: getAllActivity(),
    team: getAllTeam(),
    devices: getAllDevices(),
    borrowRequests: getAllBorrowRequests(),
  };
}

function buildBackupSummary() {
  const databaseExists = fs.existsSync(DB_PATH);
  const uploadFiles = countFilesRecursively(UPLOAD_DIR);
  const mediaCount = get("SELECT COUNT(*) AS count FROM media").count;
  const todoCount = get("SELECT COUNT(*) AS count FROM todos").count;
  const activityCount = get("SELECT COUNT(*) AS count FROM activity").count;
  return {
    generatedAt: nowIso(),
    databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
    databaseExists,
    uploadDir: "server/uploads",
    uploadFiles,
    counts: {
      media: mediaCount,
      todos: todoCount,
      activity: activityCount,
    },
  };
}

function countFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFilesRecursively(full);
    } else {
      total += 1;
    }
  }
  return total;
}

function isMediaFile(file) {
  return Boolean(file && (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")));
}

function buildUploadedMedia(file, overrides = {}) {
  const kind = file.mimetype.startsWith("video/") ? "video" : "photo";
  const publicUrl = `/uploads/media/${file.filename}`;
  const title = overrides.title || file.originalname.replace(/\.[^.]+$/, "");
  return {
    id: randomId("media"),
    kind,
    title,
    source: overrides.source || `本地上传 / ${file.originalname}`,
    source_type: "upload",
    source_path: path.join("media", file.filename).replace(/\\/g, "/"),
    author: overrides.author || "工作台",
    duration: kind === "video" ? "本地视频" : "本地图片",
    status: "待审",
    note: overrides.note || "由浏览器上传到本地素材库。",
    tags_json: JSON.stringify(overrides.tags || ["上传", kind === "video" ? "视频" : "图片"]),
    thumb: kind === "video" ? createThumb(title, "#1f5a49", "#ef6c4e", "video") : publicUrl,
    url: publicUrl,
    review_state: "pending",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function insertMediaRecord(record) {
  runWrite(
    `INSERT INTO media
      (id, kind, title, source, source_type, source_path, author, duration, status, note, tags_json, thumb, url, review_state, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.kind,
      record.title,
      record.source,
      record.source_type,
      record.source_path,
      record.author,
      record.duration,
      record.status,
      record.note,
      record.tags_json,
      record.thumb,
      record.url,
      record.review_state,
      record.created_at,
      record.updated_at,
    ],
  );
}

function logActivity(title, meta, detail) {
  runWrite(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomId("act"), title, meta, detail, nowIso()],
  );
}

function scanInbox() {
  const files = fs.existsSync(INBOX_DIR)
    ? fs
        .readdirSync(INBOX_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    : [];

  const existing = new Set(
    all("SELECT source_path FROM media WHERE source_type = 'inbox' AND source_path IS NOT NULL").map((row) => row.source_path),
  );
  const imported = [];

  transaction(() => {
    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      const isVideo = [".mp4", ".mov", ".webm", ".m4v"].includes(ext);
      const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext);
      if (!isVideo && !isImage) continue;

      const sourcePath = `inbox/${name}`;
      if (existing.has(sourcePath)) continue;

      const fileUrl = `/uploads/inbox/${encodeURIComponent(name)}`;
      const title = name.replace(/\.[^.]+$/, "");
      const record = {
        id: randomId("media"),
        kind: isVideo ? "video" : "photo",
        title,
        source: `服务器同步 / ${name}`,
        source_type: "inbox",
        source_path: sourcePath,
        author: "服务器照片",
        duration: isVideo ? "同步视频" : "同步图片",
        status: "待审",
        note: "从服务器 inbox 目录同步而来。",
        tags_json: JSON.stringify(["服务器", "同步", isVideo ? "视频" : "图片"]),
        thumb: isVideo ? createThumb(title, "#163d32", "#ef6c4e", "video") : fileUrl,
        url: fileUrl,
        review_state: "pending",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      insertMediaRecord(record);
      imported.push(record);
    }

    if (imported.length) {
      setSetting("syncMessage", `已同步 ${imported.length} 个服务器素材`);
      setSetting("lastSyncAt", nowIso());
      logActivity("服务器照片同步", `新增 ${imported.length} 条`, "已从 inbox 目录导入到素材库。");
    }
  });

  if (imported.length) {
    persistDb();
  }

  return { imported: imported.map(mediaRowToItem) };
}

function seedTables() {
  if (!get("SELECT COUNT(*) AS count FROM users").count) {
    createAdminUser(ADMIN_USERNAME, ADMIN_PASSWORD);
  } else {
    const adminUser = get("SELECT * FROM users WHERE username = ? LIMIT 1", [ADMIN_USERNAME]);
    if (adminUser && !verifyPassword(ADMIN_PASSWORD, adminUser)) {
      const { salt, hash } = createPasswordHash(ADMIN_PASSWORD);
      runWrite("UPDATE users SET username = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?", [
        ADMIN_USERNAME,
        hash,
        salt,
        nowIso(),
        adminUser.id,
      ]);
      persistDb();
      logServerEvent("info", "admin_user_synced", {
        username: ADMIN_USERNAME,
        reason: "env_password_changed",
      });
    }
  }

  if (!get("SELECT COUNT(*) AS count FROM settings").count) {
    setSetting("siteTitle", SITE_TITLE);
    setSetting("siteSubtitle", SITE_SUBTITLE);
    setSetting("homeHeroMessage", "首页只保留最关键的摘要，方便快速进入工作状态。");
    setSetting("publicUrl", PUBLIC_URL);
    setSetting("syncMessage", "等待同步");
    setSetting("lastSyncAt", "");
  }

  if (!get("SELECT COUNT(*) AS count FROM team").count) {
    transaction(() => {
      for (const [index, item] of defaultTeam().entries()) {
        runWrite(
          `INSERT INTO team (id, name, role, note, badge, email, phone, status, joined_at, order_index, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.name, item.role, item.note, item.badge, item.email, item.phone, item.status, item.joined_at, index + 1, item.joined_at, item.joined_at],
        );
      }
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM media").count) {
    transaction(() => {
      defaultMedia().forEach((item) => {
        insertMediaRecord(item);
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM todos").count) {
    transaction(() => {
      const now = nowIso();
      defaultTodos().forEach((item) => {
        runWrite(
          `INSERT INTO todos (id, title, priority, done, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [item.id, item.title, normalizePriority(item.priority), item.done ? 1 : 0, now, now],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM activity").count) {
    transaction(() => {
      defaultActivity().forEach((item) => {
        runWrite(
          `INSERT INTO activity (id, title, meta, detail, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [item.id, item.title, item.meta, item.detail, item.createdAt || nowIso()],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM devices").count) {
    transaction(() => {
      const now = nowIso();
      const seedDevices = [
        { id: "device-1", name: "摄影机 A1", category: "摄影", asset_no: "DEV-001", status: "available", location: "资料室 A 架", owner: "王老师", note: "常用于活动拍摄", created_at: now, updated_at: now },
        { id: "device-2", name: "收音麦克风", category: "收音", asset_no: "DEV-002", status: "borrowed", location: "器材柜 2 层", owner: "张老师", note: "当前外借中", created_at: now, updated_at: now },
        { id: "device-3", name: "剪辑笔记本", category: "电脑", asset_no: "DEV-003", status: "maintenance", location: "办公室", owner: "李老师", note: "等待系统重装", created_at: now, updated_at: now },
      ];
      seedDevices.forEach((item) => {
        runWrite(
          `INSERT INTO devices (id, name, category, asset_no, status, location, owner, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.name, item.category, item.asset_no, item.status, item.location, item.owner, item.note, item.created_at, item.updated_at],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM borrow_requests").count) {
    transaction(() => {
      const now = nowIso();
      runWrite(
        `INSERT INTO borrow_requests
          (id, applicant, device_id, purpose, borrow_at, expected_return_at, note, status, return_status, approved_by, approved_at, returned_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "borrow-1",
          "林晓然",
          "device-1",
          "校园活动拍摄",
          now,
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          "用于本周活动记录",
          "pending",
          "not_returned",
          "",
          "",
          "",
          now,
          now,
        ],
      );
    });
    persistDb();
  }
}

function createDb(SQL) {
  if (fs.existsSync(DB_PATH)) {
    try {
      return new SQL.Database(fs.readFileSync(DB_PATH));
    } catch (error) {
      logServerEvent("error", "database_open_failed", {
        databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
        error,
      });
    }
  }
  return new SQL.Database();
}

function persistDb() {
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (error) {
    logServerEvent("error", "database_persist_failed", {
      databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
      error,
    });
    throw error;
  }
}

function runWrite(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } catch (error) {
    logServerEvent("error", "database_write_failed", { sql, params, error });
    throw error;
  } finally {
    stmt.free();
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } catch (error) {
    logServerEvent("error", "database_read_failed", { sql, params, error });
    throw error;
  } finally {
    stmt.free();
  }
}

function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    persistDb();
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    logServerEvent("error", "database_transaction_failed", { error });
    throw error;
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    logAuthFailure(req, "forbidden", { requiredRole: "admin" });
    return res.status(403).json({ error: "权限不足。" });
  }
  next();
}

function sessionToPayload(session) {
  if (!session) {
    return { authenticated: false, user: null };
  }
  return {
    authenticated: true,
    user: session.user,
    expiresAt: session.expiresAt,
  };
}

async function main() {
  const sqlDir = path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlDir, file),
  });

  db = createDb(SQL);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      note TEXT NOT NULL,
      badge TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    -- 扩展 team 表字段（兼容已有数据库）
    PRAGMA table_info(team);

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_path TEXT,
      author TEXT NOT NULL,
      duration TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      thumb TEXT NOT NULL,
      url TEXT NOT NULL,
      review_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      priority TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      meta TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      asset_no TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      location TEXT,
      owner TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS borrow_requests (
      id TEXT PRIMARY KEY,
      applicant TEXT NOT NULL,
      device_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      borrow_at TEXT NOT NULL,
      expected_return_at TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL,
      return_status TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      returned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 扩展 team 表字段
  try {
    const teamColumns = all("PRAGMA table_info(team)").map(col => col.name);
    if (!teamColumns.includes("email")) {
      db.exec("ALTER TABLE team ADD COLUMN email TEXT DEFAULT ''");
    }
    if (!teamColumns.includes("phone")) {
      db.exec("ALTER TABLE team ADD COLUMN phone TEXT DEFAULT ''");
    }
    if (!teamColumns.includes("status")) {
      db.exec("ALTER TABLE team ADD COLUMN status TEXT DEFAULT 'active'");
    }
    if (!teamColumns.includes("joined_at")) {
      db.exec("ALTER TABLE team ADD COLUMN joined_at TEXT DEFAULT ''");
    }
  } catch (error) {
    logDbIssue("team_table_migration_failed", error);
  }

  seedTables();
  persistDb();

  const app = express();
  app.set("trust proxy", TRUST_PROXY);
  app.disable("x-powered-by");
  
  // 安全头配置
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  
  // 全局速率限制
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 限制1000次请求
    message: { error: "请求过于频繁,请稍后再试。" },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });
  app.use(globalLimiter);

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
  ["get", "post", "patch", "delete", "put", "use"].forEach((methodName) => {
    const original = app[methodName].bind(app);
    app[methodName] = (firstArg, ...rest) => {
      if (typeof firstArg === "string" && firstArg.startsWith("/api/")) {
        captureApiRoute(methodName, firstArg);
      }
      return original(firstArg, ...rest);
    };
  });
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
  app.use("/uploads", express.static(UPLOAD_DIR));
  app.use(express.static(ROOT_DIR, { index: false, dotfiles: "ignore" }));

  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination(req, file, cb) {
        cb(null, MEDIA_DIR);
      },
      filename(req, file, cb) {
        const ext = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${randomId("upload")}${ext}`);
      },
    }),
    limits: {
      fileSize: MAX_UPLOAD_MB * 1024 * 1024,
      files: MAX_UPLOAD_FILES,
    },
    fileFilter(req, file, cb) {
      if (isMediaFile(file)) {
        return cb(null, true);
      }
      const error = new Error("仅支持图片或视频文件。");
      error.statusCode = 400;
      error.code = "UNSUPPORTED_MEDIA_TYPE";
      cb(error);
    },
  });

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      timestamp: nowIso(),
      status: "running",
      nodeEnv: process.env.NODE_ENV || "development",
      port: PORT,
      host: HOST,
      databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
      ...getRouteHealth(),
    });
  });

  app.get("/api/routes", (req, res) => {
    res.json({
      ok: true,
      ...getRouteHealth(),
      routes: apiRouteCatalog,
    });
  });

  app.get("/api/session", (req, res) => {
    const session = getSession(req);
    if (!session) {
      return res.json({ authenticated: false, user: null });
    }
    req.session = session;
    req.user = session.user;
    res.json(sessionToPayload(session));
  });

  app.post("/api/login", loginLimiter, (req, res) => {
    const body = req.body || {};
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      logLoginFailure(req, username || "");
      return res.status(400).json({ error: "请输入用户名和密码。" });
    }

    const userRow = get("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
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

  app.post("/api/logout", (req, res) => {
    const session = getSession(req);
    if (session) {
      destroySession(session.token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get("/api/bootstrap", requireAuth, (req, res) => {
    res.json(buildBootstrap(req.user));
  });

  app.get("/api/backup", requireAuth, requireAdmin, (req, res) => {
    const summary = buildBackupSummary();
    const filename = `backup-${nowLocalDateKey()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(summary);
  });

  app.get("/api/settings", requireAuth, requireAdmin, (req, res) => {
    res.json(getSettings());
  });

  app.patch("/api/settings", requireAuth, requireAdmin, (req, res) => {
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

  app.get("/api/devices", requireAuth, (req, res) => {
    res.json({ ok: true, items: getDeviceList(req.query || {}) });
  });

  app.get("/api/devices/:id", requireAuth, (req, res) => {
    const id = String(req.params.id || "");
    const device = getDeviceById(id);
    if (!device) {
      return res.status(404).json({ error: "设备不存在。" });
    }
    res.json({ ok: true, item: deviceRowToItem(device) });
  });

  app.post("/api/devices", requireAuth, requireAdmin, (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const assetNo = String(body.assetNo || "").trim();
    const status = String(body.status || "available");
    const location = String(body.location || "").trim();
    const owner = String(body.owner || "").trim();
    const note = String(body.note || "").trim();
    if (!name || !category || !assetNo) {
      return res.status(400).json({ error: "请填写设备名称、类别和编号。" });
    }

    const item = {
      id: randomId("device"),
      name,
      category,
      asset_no: assetNo,
      status: ["available", "borrowed", "maintenance"].includes(status) ? status : "available",
      location,
      owner,
      note,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    transaction(() => {
      runWrite(
        `INSERT INTO devices (id, name, category, asset_no, status, location, owner, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.name, item.category, item.asset_no, item.status, item.location, item.owner, item.note, item.created_at, item.updated_at],
      );
      logServerEvent("info", "device_create", {
        method: req.method,
        path: req.originalUrl || req.url,
        role: req.user?.role || "admin",
        deviceId: item.id,
        name: item.name,
      });
    });
    res.json({ ok: true, item: deviceRowToItem(item) });
  });

  app.patch("/api/devices/:id", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get("SELECT * FROM devices WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "设备不存在。" });
    }

    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name || "").trim() : existing.name;
    const category = body.category !== undefined ? String(body.category || "").trim() : existing.category;
    const assetNo = body.assetNo !== undefined ? String(body.assetNo || "").trim() : existing.asset_no;
    const status = body.status !== undefined ? String(body.status || "").trim() : existing.status;
    const location = body.location !== undefined ? String(body.location || "").trim() : existing.location;
    const owner = body.owner !== undefined ? String(body.owner || "").trim() : existing.owner;
    const note = body.note !== undefined ? String(body.note || "").trim() : existing.note;
    const nextStatus = ["available", "borrowed", "maintenance"].includes(status) ? status : existing.status;

    transaction(() => {
      runWrite(
        `UPDATE devices
         SET name = ?, category = ?, asset_no = ?, status = ?, location = ?, owner = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [name, category, assetNo, nextStatus, location, owner, note, nowIso(), id],
      );
    });

    const updated = get("SELECT * FROM devices WHERE id = ? LIMIT 1", [id]);
    res.json({ ok: true, item: deviceRowToItem(updated) });
  });

  app.delete("/api/devices/:id", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get("SELECT * FROM devices WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "设备不存在。" });
    }

    const activeBorrow = get(
      "SELECT * FROM borrow_requests WHERE device_id = ? AND status = 'approved' AND return_status != 'returned' LIMIT 1",
      [id],
    );
    if (activeBorrow) {
      return res.status(409).json({ error: "该设备正在借出中，无法删除。" });
    }

    transaction(() => {
      runWrite("DELETE FROM devices WHERE id = ?", [id]);
    });

    res.json({ ok: true });
  });

  app.get("/api/borrow-requests", requireAuth, (req, res) => {
    res.json({ ok: true, items: getBorrowRequestList(req.query || {}) });
  });

  app.get("/api/borrow-requests/:id", requireAuth, (req, res) => {
    const id = String(req.params.id || "");
    const item = getBorrowRequestById(id);
    if (!item) {
      return res.status(404).json({ error: "借出申请不存在。" });
    }
    res.json({ ok: true, item: borrowRequestRowToItem(item) });
  });

  app.post("/api/borrow-requests", requireAuth, (req, res) => {
    const body = req.body || {};
    const applicant = String(body.applicant || "").trim();
    const deviceId = String(body.deviceId || "").trim();
    const purpose = String(body.purpose || "").trim();
    const borrowAt = String(body.borrowAt || "").trim();
    const expectedReturnAt = String(body.expectedReturnAt || "").trim();
    const note = String(body.note || "").trim();
    if (!applicant || !deviceId || !purpose || !borrowAt || !expectedReturnAt) {
      return res.status(400).json({ error: "请把借出申请信息填写完整。" });
    }

    const device = get("SELECT * FROM devices WHERE id = ? LIMIT 1", [deviceId]);
    if (!device) {
      return res.status(404).json({ error: "申请设备不存在。" });
    }

    const item = {
      id: randomId("borrow"),
      applicant,
      device_id: deviceId,
      purpose,
      borrow_at: borrowAt,
      expected_return_at: expectedReturnAt,
      note,
      status: "pending",
      return_status: "not_returned",
      approved_by: "",
      approved_at: "",
      returned_at: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    transaction(() => {
      runWrite(
        `INSERT INTO borrow_requests
          (id, applicant, device_id, purpose, borrow_at, expected_return_at, note, status, return_status, approved_by, approved_at, returned_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.applicant, item.device_id, item.purpose, item.borrow_at,
          item.expected_return_at, item.note, item.status, item.return_status,
          item.approved_by, item.approved_at, item.returned_at, item.created_at, item.updated_at,
        ],
      );
    });

    res.json({ ok: true, item: borrowRequestRowToItem({ ...item, device_name: device.name }) });
  });

  app.patch("/api/borrow-requests/:id", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get(
      `SELECT borrow_requests.*, devices.name AS device_name
       FROM borrow_requests
       LEFT JOIN devices ON devices.id = borrow_requests.device_id
       WHERE borrow_requests.id = ? LIMIT 1`,
      [id],
    );
    if (!existing) {
      return res.status(404).json({ error: "借出申请不存在。" });
    }

    const body = req.body || {};
    const nextStatus = body.status ? String(body.status || "").trim() : existing.status;
    const nextReturnStatus = body.returnStatus ? String(body.returnStatus || "").trim() : existing.return_status;
    const now = nowIso();
    const device = get("SELECT * FROM devices WHERE id = ? LIMIT 1", [existing.device_id]);

    if (body.status === "approved") {
      if (existing.status !== "pending") {
        return res.status(409).json({ error: "只有待审申请才能通过。" });
      }
      if (!device) {
        return res.status(404).json({ error: "关联设备不存在。" });
      }
      if (device.status !== "available") {
        return res.status(409).json({ error: "该设备当前不可借出。" });
      }
    }

    if (body.status === "rejected" && existing.status !== "pending") {
      return res.status(409).json({ error: "只有待审申请才能拒绝。" });
    }

    if (body.returnStatus === "returned") {
      if (existing.status !== "approved") {
        return res.status(409).json({ error: "只有已通过的申请才能归还。" });
      }
      if (existing.return_status === "returned") {
        return res.status(409).json({ error: "该申请已经完成归还。" });
      }
    }

    transaction(() => {
      if (body.status === "approved") {
        runWrite(
          `UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
          [nextStatus, req.user?.username || "admin", now, now, id],
        );
        runWrite("UPDATE devices SET status = ?, updated_at = ? WHERE id = ?", ["borrowed", now, existing.device_id]);
      } else if (body.status === "rejected") {
        runWrite(
          `UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
          [nextStatus, req.user?.username || "admin", now, now, id],
        );
      } else if (body.returnStatus === "returned") {
        runWrite(
          `UPDATE borrow_requests SET return_status = ?, returned_at = ?, updated_at = ? WHERE id = ?`,
          [nextReturnStatus, now, now, id],
        );
        runWrite("UPDATE devices SET status = ?, updated_at = ? WHERE id = ?", ["available", now, existing.device_id]);
      }
    });

    const updated = get(
      `SELECT borrow_requests.*, devices.name AS device_name
       FROM borrow_requests
       LEFT JOIN devices ON devices.id = borrow_requests.device_id
       WHERE borrow_requests.id = ? LIMIT 1`,
      [id],
    );
    res.json({ ok: true, item: borrowRequestRowToItem(updated) });
  });

  app.post("/api/media/sync", requireAuth, (req, res) => {
    try {
      const result = scanInbox();
      res.json({ ok: true, imported: result.imported });
    } catch (error) {
      logUploadIssue(req, error, { reason: "sync_failed" });
      res.status(500).json({ error: "素材同步失败。" });
    }
  });

  app.post("/api/media/upload", requireAuth, mediaUpload.array("files", MAX_UPLOAD_FILES), (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: "请先选择要上传的文件。" });
    }

    const items = [];
    transaction(() => {
      for (const file of files) {
        const record = buildUploadedMedia(file, {
          author: req.user?.username || "工作台",
        });
        insertMediaRecord(record);
        items.push(mediaRowToItem(record));
        logActivity("素材上传", req.user?.username || "unknown", `上传了 ${record.title}`);
      }
    });

    res.json({ ok: true, items });
  });

  app.post("/api/media/:id/review", requireAuth, (req, res) => {
    const id = String(req.params.id || "");
    const status = String(req.body?.status || "");
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "审核状态不正确。" });
    }

    let updated = null;
    transaction(() => {
      const row = get("SELECT * FROM media WHERE id = ? LIMIT 1", [id]);
      if (!row) {
        const error = new Error("素材不存在。");
        error.statusCode = 404;
        throw error;
      }
      const nextStatus = status === "approved" ? "已通过" : "退回";
      runWrite(
        "UPDATE media SET review_state = ?, status = ?, updated_at = ? WHERE id = ?",
        [status, nextStatus, nowIso(), id],
      );
      updated = get("SELECT * FROM media WHERE id = ? LIMIT 1", [id]);
      logActivity("素材审核", req.user?.username || "unknown", `${row.title} 已${nextStatus}`);
    });

    res.json({ ok: true, item: mediaRowToItem(updated) });
  });

  app.get("/api/todos", requireAuth, (req, res) => {
    res.json({ ok: true, items: getAllTodos() });
  });

  app.post("/api/todos", requireAuth, (req, res) => {
    const title = String(req.body?.title || "").trim();
    const priority = normalizePriority(String(req.body?.priority || "中"));
    if (!title) {
      return res.status(400).json({ error: "请输入待办标题。" });
    }

    const item = {
      id: randomId("todo"),
      title,
      priority,
      done: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    transaction(() => {
      runWrite(
        "INSERT INTO todos (id, title, priority, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [item.id, item.title, item.priority, 0, item.created_at, item.updated_at],
      );
      logActivity("待办新增", req.user?.username || "unknown", item.title);
    });

    res.json({ ok: true, item: todoRowToItem(item) });
  });

  app.patch("/api/todos/:id", requireAuth, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get("SELECT * FROM todos WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "待办不存在。" });
    }

    const nextTitle = req.body?.title !== undefined ? String(req.body.title || "").trim() : existing.title;
    const nextPriority = req.body?.priority !== undefined ? normalizePriority(String(req.body.priority || "")) : existing.priority;
    const nextDone = req.body?.done !== undefined ? (req.body.done ? 1 : 0) : existing.done;

    transaction(() => {
      runWrite(
        "UPDATE todos SET title = ?, priority = ?, done = ?, updated_at = ? WHERE id = ?",
        [nextTitle, nextPriority, nextDone, nowIso(), id],
      );
    });

    const updated = get("SELECT * FROM todos WHERE id = ? LIMIT 1", [id]);
    res.json({ ok: true, item: todoRowToItem(updated) });
  });

  app.delete("/api/todos/:id", requireAuth, (req, res) => {
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

  // Team API
  app.get("/api/team", requireAuth, (req, res) => {
    const search = normalizeSearchValue(req.query.search || req.query.q || "");
    const status = normalizeSearchValue(req.query.status || "");
    const role = normalizeSearchValue(req.query.role || "");
    let items = getAllTeam();
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.role.toLowerCase().includes(searchLower) ||
        item.note.toLowerCase().includes(searchLower)
      );
    }
    if (status && status !== "all") {
      items = items.filter(item => item.status === status);
    }
    if (role) {
      const roleLower = role.toLowerCase();
      items = items.filter(item => item.role.toLowerCase().includes(roleLower));
    }
    res.json({ ok: true, items });
  });

  app.post("/api/team", requireAuth, requireAdmin, (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    const note = String(body.note || "").trim();
    const badge = String(body.badge || "").trim() || (name ? name.charAt(0) : "");
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const status = ["active", "leave", "inactive"].includes(body.status) ? body.status : "active";
    const joinedAt = String(body.joinedAt || "").trim() || nowIso();
    if (!name || !role) {
      return res.status(400).json({ error: "请填写成员姓名和角色。" });
    }

    const maxOrder = get("SELECT MAX(order_index) AS max FROM team")?.max || 0;
    const item = {
      id: randomId("team"),
      name, role, note, badge, email, phone, status,
      joined_at: joinedAt,
      order_index: maxOrder + 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    transaction(() => {
      runWrite(
        `INSERT INTO team (id, name, role, note, badge, email, phone, status, joined_at, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.name, item.role, item.note, item.badge, item.email, item.phone, item.status, item.joined_at, item.order_index, item.created_at, item.updated_at],
      );
      logActivity("团队成员新增", req.user?.username || "admin", `${item.name} 加入团队`);
    });
    res.json({ ok: true, item: teamRowToItem(item) });
  });

  app.patch("/api/team/:id", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "团队成员不存在。" });
    }

    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name || "").trim() : existing.name;
    const role = body.role !== undefined ? String(body.role || "").trim() : existing.role;
    const note = body.note !== undefined ? String(body.note || "").trim() : existing.note;
    const badge = body.badge !== undefined ? String(body.badge || "").trim() : existing.badge;
    const email = body.email !== undefined ? String(body.email || "").trim() : (existing.email || "");
    const phone = body.phone !== undefined ? String(body.phone || "").trim() : (existing.phone || "");
    const status = body.status !== undefined && ["active", "leave", "inactive"].includes(body.status) ? body.status : (existing.status || "active");
    const joinedAt = body.joinedAt !== undefined ? String(body.joinedAt || "").trim() : (existing.joined_at || "");

    transaction(() => {
      runWrite(
        `UPDATE team SET name = ?, role = ?, note = ?, badge = ?, email = ?, phone = ?, status = ?, joined_at = ?, updated_at = ? WHERE id = ?`,
        [name, role, note, badge, email, phone, status, joinedAt, nowIso(), id],
      );
    });

    const updated = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
    res.json({ ok: true, item: teamRowToItem(updated) });
  });

  app.delete("/api/team/:id", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "团队成员不存在。" });
    }
    transaction(() => {
      runWrite("DELETE FROM team WHERE id = ?", [id]);
    });
    res.json({ ok: true });
  });

  app.patch("/api/team/:id/order", requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id || "");
    const newOrder = Number(req.body?.orderIndex);
    if (!Number.isInteger(newOrder) || newOrder < 1) {
      return res.status(400).json({ error: "排序值无效。" });
    }
    const existing = get("SELECT * FROM team WHERE id = ? LIMIT 1", [id]);
    if (!existing) {
      return res.status(404).json({ error: "团队成员不存在。" });
    }
    transaction(() => {
      const oldOrder = existing.order_index;
      if (oldOrder === newOrder) return;
      if (newOrder < oldOrder) {
        runWrite("UPDATE team SET order_index = order_index + 1 WHERE order_index >= ? AND order_index < ?", [newOrder, oldOrder]);
      } else {
        runWrite("UPDATE team SET order_index = order_index - 1 WHERE order_index > ? AND order_index <= ?", [oldOrder, newOrder]);
      }
      runWrite("UPDATE team SET order_index = ?, updated_at = ? WHERE id = ?", [newOrder, nowIso(), id]);
    });
    res.json({ ok: true, items: getAllTeam() });
  });

  app.post("/api/client-log", (req, res) => {
    const body = req.body || {};
    logServerEvent("error", "client_log", {
      message: typeof body.message === "string" ? body.message : "client error",
      category: typeof body.category === "string" ? body.category : "client",
      page: typeof body.page === "string" ? body.page : req.get("referer") || "",
      payload: body.payload || {},
      userAgent: req.get("user-agent") || "",
      role: req.user?.role || req.session?.user?.role || "guest",
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
    });
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/") && req.accepts("html")) {
      return res.sendFile(path.join(ROOT_DIR, "index.html"));
    }
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      return res.status(404).send("Not Found");
    }
    return res.status(404).json({ error: "未找到对应接口。" });
  });

  app.use((err, req, res, next) => {
    const statusCode = err?.statusCode || err?.status || 500;
    if (err && err.code === "LIMIT_FILE_SIZE") {
      logUploadIssue(req, err, { reason: "file_size_limit", limitMb: MAX_UPLOAD_MB });
      return res.status(413).json({ error: "单个文件不能超过 " + MAX_UPLOAD_MB + "MB。" });
    }
    if (err && err.code === "LIMIT_FILE_COUNT") {
      logUploadIssue(req, err, { reason: "file_count_limit", limitFiles: MAX_UPLOAD_FILES });
      return res.status(413).json({ error: "单次最多上传 " + MAX_UPLOAD_FILES + " 个文件。" });
    }
    if (err && err.code === "UNSUPPORTED_MEDIA_TYPE") {
      logUploadIssue(req, err, { reason: "unsupported_media_type" });
      return res.status(400).json({ error: "仅支持图片或视频文件。" });
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

  app.listen(PORT, HOST, () => {
    const lanIps = getLanIpAddresses();
    const localUrl = `http://127.0.0.1:${PORT}`;
    const lanUrls = lanIps.map((ip) => `http://${ip}:${PORT}`);
    const routeHealth = getRouteHealth();

    console.log(`声声网络思政工作室已启动：http://${HOST}:${PORT}`);
    console.log(`本机访问：${localUrl}`);
    console.log(`API 路由数：${routeHealth.apiRouteCount}`);
    if (lanUrls.length > 0) {
      console.log(`局域网访问：${lanUrls.join("、")}`);
    } else {
      console.log(`局域网访问：请使用同网段设备打开 http://<本机局域网IP>:${PORT}`);
    }
    logStartupInfo({
      phase: "listening",
      url: `http://${HOST}:${PORT}`,
      localUrl, lanUrls, ...routeHealth,
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
