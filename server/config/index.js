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
  CSRF_SECRET: (function resolveSessionSecret() {
    const env = process.env;
    const explicit = env.CSRF_SECRET || env.SESSION_SECRET;
    if (explicit && explicit.length >= 32) return explicit;

    const isProd = (env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd) {
      console.error('\x1b[31m[FATAL]\x1b[0m 生产环境必须设置 CSRF_SECRET / SESSION_SECRET 环境变量(长度 ≥ 32)。');
      console.error('       例如: CSRF_SECRET="$(openssl rand -hex 48)" pm2 start ecosystem.config.js');
      process.exit(1);
    }
    console.warn('\x1b[33m[warn]\x1b[0m 未设置 CSRF_SECRET,使用临时随机值;重启后所有会话将失效。');
    return crypto.randomBytes(32).toString('hex');
  })(),

  // 上传配置
  // MAX_UPLOAD_MB：单文件软上限（默认调高至 2GB）；可经环境变量继续调高
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 2048),
  // MAX_UPLOAD_FILES：单次请求文件数软上限（前端分批规避，保护单请求）
  MAX_UPLOAD_FILES: Number(process.env.MAX_UPLOAD_FILES || 50),
  MAX_AVATAR_MB: Number(process.env.MAX_AVATAR_MB || 5),
  // 批量上传/传输
  UPLOAD_BATCH_SIZE: Number(process.env.UPLOAD_BATCH_SIZE || 20),      // 前端每批文件数
  TRANSFER_CONCURRENCY: Number(process.env.TRANSFER_CONCURRENCY || 4),  // 前端并发批次数
  TRANSFER_HASH_BATCH: Number(process.env.TRANSFER_HASH_BATCH || 2),    // 空闲哈希每轮处理条数

  // 自动扫描配置
  AUTO_SCAN_SECONDS: Number(process.env.INBOX_AUTO_SCAN_SECONDS || 60),

  // 飞书多维表格同步配置（设备申请双向同步）
  // 缺关键项时 enabled=false，启动时 warn；不阻断服务器启动
  FEISHU: (function resolveFeishu() {
    const env = process.env;
    const appId = env.FEISHU_APP_ID || '';
    const appSecret = env.FEISHU_APP_SECRET || '';
    const appToken = env.FEISHU_APP_TOKEN || '';
    const tableId = env.FEISHU_TABLE_ID || '';
    const enabled = String(env.FEISHU_SYNC_ENABLED || '0') !== '0' && !!(appId && appSecret && appToken && tableId);
    return {
      appId,
      appSecret,
      appToken,
      tableId,
      enabled,
      intervalSec: Math.max(60, Number(env.FEISHU_SYNC_INTERVAL_SEC || 300)),
    };
  })(),

  // 站点配置
  SITE_TITLE: process.env.SITE_TITLE || '思想工作台',
  SITE_SUBTITLE: process.env.SITE_SUBTITLE || '可落盘的排障与协作中心',

  // 认证配置
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: (function resolveAdminPassword() {
    const pw = process.env.ADMIN_PASSWORD || 'admin123456';
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (pw.length < 12) {
      if (isProd) {
        console.error('\x1b[31m[FATAL]\x1b[0m 生产环境 ADMIN_PASSWORD 长度必须 ≥ 12 位,请通过环境变量设置。');
        process.exit(1);
      }
      console.warn(`\x1b[33m[warn]\x1b[0m ADMIN_PASSWORD 使用弱默认值(${pw === 'admin123456' ? '内置' : '环境变量'});首次登录后请立即修改。`);
    }
    return pw;
  })(),
  GUEST_USERNAME: process.env.GUEST_USERNAME || 'guest',
  GUEST_PASSWORD: (function resolveGuestPassword() {
    const pw = process.env.GUEST_PASSWORD || 'guest123';
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (pw.length < 8) {
      if (isProd) {
        console.error('\x1b[31m[FATAL]\x1b[0m 生产环境 GUEST_PASSWORD 长度必须 ≥ 8 位,请通过环境变量设置。');
        process.exit(1);
      }
      console.warn(`\x1b[33m[warn]\x1b[0m GUEST_PASSWORD 使用弱默认值(${pw === 'guest123' ? '内置' : '环境变量'});访客权限有限但仍建议尽快更换。`);
    }
    return pw;
  })(),

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
config.STAGING_DIR = path.join(config.UPLOAD_DIR, '.staging');
config.DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(config.DATA_DIR, 'studio.sqlite'));

config.resolvePath = resolvePath;

module.exports = config;
