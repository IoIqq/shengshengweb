const fs = require('fs');
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

const DATA_DIR = resolvePath(null, path.join(__dirname, '..', 'data'));
const STORAGE_CONFIG_PATH = path.join(DATA_DIR, 'storage-config.json');

function readStorageConfig() {
  try {
    if (!fs.existsSync(STORAGE_CONFIG_PATH)) return {};
    const payload = JSON.parse(fs.readFileSync(STORAGE_CONFIG_PATH, 'utf8'));
    return payload && typeof payload === 'object' ? payload : {};
  } catch (error) {
    return {};
  }
}

function getConfiguredPath(storageConfig, key) {
  const value = typeof storageConfig[key] === 'string' ? storageConfig[key].trim() : '';
  return value || '';
}

function choosePath(envValue, storageValue, defaultPath) {
  if (envValue) return { value: resolvePath(envValue, defaultPath), source: 'env' };
  if (storageValue) return { value: resolvePath(storageValue, defaultPath), source: 'storage-config' };
  return { value: defaultPath, source: 'default' };
}

const storageConfig = readStorageConfig();
const uploadPath = choosePath(
  process.env.UPLOAD_DIR,
  getConfiguredPath(storageConfig, 'uploadDir'),
  path.join(__dirname, '..', 'uploads')
);

const config = {
  // 目录配置
  ROOT_DIR,
  DATA_DIR,
  LOG_DIR: resolvePath(null, path.join(__dirname, '..', 'logs')),
  STORAGE_CONFIG_PATH,
  STORAGE_CONFIG: storageConfig,
  UPLOAD_DIR: uploadPath.value,
  UPLOAD_DIR_SOURCE: uploadPath.source,

  // 服务器配置
  // 默认端口选 48080：好记（呼应 8080），但落在不常用的高段，
  // 普通开发工具很少占用；又在 Windows 临时端口段(49152+)之下，不会被当作出站端口抢走。
  PORT: Number(process.env.PORT || 48080),
  // 首选端口被占用时自动回退的候选列表
  PORT_FALLBACKS: [48081, 48082, 49080, 38080],
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
const inboxPath = choosePath(
  process.env.INBOX_DIR,
  getConfiguredPath(storageConfig, 'inboxDir'),
  path.join(config.UPLOAD_DIR, 'inbox')
);
config.INBOX_DIR = inboxPath.value;
config.INBOX_DIR_SOURCE = inboxPath.source;
config.DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(config.DATA_DIR, 'studio.sqlite'));

config.resolvePath = resolvePath;

module.exports = config;
