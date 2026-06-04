const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..', '..');  // 项目根目录，不是public

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

const config = {
  // 目录配置
  ROOT_DIR,
  DATA_DIR: resolvePath(null, path.join(__dirname, '..', 'data')),
  LOG_DIR: resolvePath(null, path.join(__dirname, '..', 'logs')),
  UPLOAD_DIR: resolvePath(process.env.UPLOAD_DIR, path.join(__dirname, '..', 'uploads')),

  // 服务器配置
  PORT: Number(process.env.PORT || 3002),
  HOST: process.env.HOST || '0.0.0.0',
  TRUST_PROXY: String(process.env.TRUST_PROXY || '1') !== '0',
  PUBLIC_URL: process.env.PUBLIC_URL || '',

  // 会话配置
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS || 72),
  SESSION_COOKIE: 'ss_sid',

  // CSRF配置
  CSRF_COOKIE: 'ss_csrf',
  CSRF_HEADER: 'x-csrf-token',
  CSRF_SECRET: process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex'),

  // 上传配置
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 200),
  MAX_UPLOAD_FILES: Number(process.env.MAX_UPLOAD_FILES || 30),
  MAX_AVATAR_MB: Number(process.env.MAX_AVATAR_MB || 5),

  // 自动扫描配置
  AUTO_SCAN_SECONDS: Number(process.env.INBOX_AUTO_SCAN_SECONDS || 60),

  // 站点配置
  SITE_TITLE: process.env.SITE_TITLE || '思想工作台',
  SITE_SUBTITLE: process.env.SITE_SUBTITLE || '可落盘的排障与协作中心',

  // 认证配置
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123456',
  GUEST_USERNAME: process.env.GUEST_USERNAME || 'guest',
  GUEST_PASSWORD: process.env.GUEST_PASSWORD || 'guest123',

  // 日志配置
  LOG_MAX_BYTES: 5 * 1024 * 1024, // 5MB 轮转阈值
  LOG_RETENTION_MS: 30 * 24 * 60 * 60 * 1000, // 30 天保留
};

// 派生路径
config.MEDIA_DIR = path.join(config.UPLOAD_DIR, 'media');
config.AVATAR_DIR = path.join(config.UPLOAD_DIR, 'avatars');
config.DEVICE_IMAGE_DIR = path.join(config.UPLOAD_DIR, 'devices');
config.INBOX_DIR = resolvePath(process.env.INBOX_DIR, path.join(config.UPLOAD_DIR, 'inbox'));
config.DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(config.DATA_DIR, 'studio.sqlite'));

module.exports = config;
