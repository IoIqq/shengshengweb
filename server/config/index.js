const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const ROOT_DIR = path.join(__dirname, "..", "..");

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

const DATA_DIR = resolvePath(null, path.join(__dirname, "..", "data"));
const LOG_DIR = resolvePath(null, path.join(__dirname, "..", "logs"));
const UPLOAD_DIR = resolvePath(process.env.UPLOAD_DIR, path.join(__dirname, "..", "uploads"));
const MEDIA_DIR = path.join(UPLOAD_DIR, "media");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const INBOX_DIR = resolvePath(process.env.INBOX_DIR, path.join(UPLOAD_DIR, "inbox"));
const DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(DATA_DIR, "studio.sqlite"));

const config = {
  // 路径配置
  ROOT_DIR,
  DATA_DIR,
  LOG_DIR,
  UPLOAD_DIR,
  MEDIA_DIR,
  AVATAR_DIR,
  INBOX_DIR,
  DB_PATH,

  // 服务器配置
  PORT: Number(process.env.PORT || 3002),
  HOST: process.env.HOST || "0.0.0.0",
  TRUST_PROXY: String(process.env.TRUST_PROXY || "1") !== "0",

  // 会话配置
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS || 72),
  SESSION_COOKIE: "ss_sid",
  CSRF_COOKIE: "ss_csrf",
  CSRF_HEADER: "x-csrf-token",
  CSRF_SECRET: process.env.CSRF_SECRET || require("crypto").randomBytes(32).toString("hex"),

  // 上传配置
  AUTO_SCAN_SECONDS: Number(process.env.INBOX_AUTO_SCAN_SECONDS || 60),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 200),
  MAX_UPLOAD_FILES: Number(process.env.MAX_UPLOAD_FILES || 30),
  MAX_AVATAR_MB: Number(process.env.MAX_AVATAR_MB || 5),

  // 站点配置
  SITE_TITLE: process.env.SITE_TITLE || "思想工作台",
  SITE_SUBTITLE: process.env.SITE_SUBTITLE || "可落盘的排障与协作中心",
  PUBLIC_URL: process.env.PUBLIC_URL || "",

  // 管理员配置
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin123456",

  // 日志配置
  LOG_MAX_BYTES: 5 * 1024 * 1024, // 5MB 轮转阈值
  LOG_RETENTION_MS: 30 * 24 * 60 * 60 * 1000, // 30 天保留

  // 媒体文件配置
  ALLOWED_MEDIA_EXTS: new Set([
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
    ".mp4", ".webm", ".mov", ".m4v", ".ogg",
  ]),
  AVATAR_EXTENSIONS: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]),

  // CSRF 配置
  CSRF_SAFE_METHODS: new Set(["GET", "HEAD", "OPTIONS"]),
  CSRF_EXEMPT_PATHS: new Set([
    "/api/login",
    "/api/client-log",
  ]),

  // 数据库持久化配置
  PERSIST_DEBOUNCE_MS: 200,
};

module.exports = config;
