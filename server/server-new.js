require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

// 导入配置和工具
const config = require('./config');
const { ensureDir } = require('./utils');
const { cleanupOldLogs, logServerEvent } = require('./utils/logger');
const { requestLogger, errorHandler, notFoundHandler } = require('./middleware');
const { csrfProtect } = require('./middleware/csrf');
const { setSessionGetter } = require('./middleware/auth');
const { startMaintenanceScheduler, stopMaintenanceScheduler } = require('./utils/maintenance-scheduler');

// 导入模型
const models = require('./models');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const todoRoutes = require('./routes/todos');
const mediaRoutes = require('./routes/media');
const devicesRoutes = require('./routes/devices');
const borrowRoutes = require('./routes/borrow');
const teamRoutes = require('./routes/team');
const profileRoutes = require('./routes/profile');
const auditRoutes = require('./routes/audit');
const topicLibraryRoutes = require('./routes/topic-library');
const storageRoutes = require('./routes/storage');
const registrationRequestRoutes = require('./routes/registration-requests');
const systemRoutes = require('./routes/system');

const STATIC_CACHEABLE_EXTENSIONS = new Set(['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf']);
const UPLOAD_CACHEABLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.m4v', '.ogg']);

// 确保必要的目录存在
const storageDirStatus = [];

function ensureRequiredDir(label, dir) {
  ensureDir(dir);
  return { label, path: dir, ok: true };
}

function ensureOptionalStorageDir(label, dir) {
  try {
    ensureDir(dir);
    storageDirStatus.push({ label, path: dir, ok: true });
  } catch (error) {
    const issue = { label, path: dir, ok: false, error: error.code || error.message };
    storageDirStatus.push(issue);
    console.warn(`⚠️  素材目录不可用：${label} -> ${dir} (${issue.error})`);
  }
}

ensureRequiredDir('数据目录', config.DATA_DIR);
ensureRequiredDir('数据库父目录', path.dirname(config.DB_PATH));
ensureRequiredDir('日志目录', config.LOG_DIR);
ensureOptionalStorageDir('素材根目录', config.UPLOAD_DIR);
ensureOptionalStorageDir('媒体目录', config.MEDIA_DIR);
ensureOptionalStorageDir('头像目录', config.AVATAR_DIR);
ensureOptionalStorageDir('设备图片目录', config.DEVICE_IMAGE_DIR);
ensureOptionalStorageDir('Inbox 目录', config.INBOX_DIR);
config.STORAGE_DIR_STATUS = storageDirStatus;

const app = express();
let httpServer = null;
let shuttingDown = false;

// ========== 初始化数据库 ==========
async function initApp() {
  try {
    await models.database.initDatabase();
    models.user.ensureUserExists(config.ADMIN_USERNAME, config.ADMIN_PASSWORD, 'admin', 'system');
    models.user.ensureUserExists(config.GUEST_USERNAME, config.GUEST_PASSWORD, 'guest', 'system');
    console.log('✓ 数据库初始化成功');

    // 配置会话获取器
    setSessionGetter(models.session.getSession);

    // 清理过期会话和旧日志
    models.session.cleanupExpiredSessions();
    cleanupOldLogs();

    // 周期性维护：清理 sessions / audit_logs / activity
    startMaintenanceScheduler(models);

    // ========== 中间件配置 ==========
    if (config.TRUST_PROXY) {
      app.set('trust proxy', 1);
    }

    // 安全头
    app.use(
      helmet({
        contentSecurityPolicy: false, // 前端已有CSP配置
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS
    app.use(cors({
      origin: config.PUBLIC_URL || true,
      credentials: true,
    }));

    // 请求日志
    app.use(requestLogger);

    // CSRF保护
    app.use(csrfProtect);

    // Gzip压缩
    app.use(
      compression({
        threshold: 1024,
        level: 6,
        filter: (req, res) => {
          if (req.headers['x-no-compression']) return false;
          const type = res.getHeader('Content-Type') || '';
          if (/^(image|video|audio)\//i.test(type)) return false;
          if (/zip|gzip|br|compressed/i.test(type)) return false;
          return compression.filter(req, res);
        },
      })
    );

    // Body解析
    app.use(express.json({ limit: '256kb' }));
    app.use(express.urlencoded({ extended: true }));

    // 上传文件静态服务（需要认证）
    const { requireAuthForUploads } = require('./middleware/auth');
    app.use('/uploads', requireAuthForUploads, express.static(config.UPLOAD_DIR, {
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (UPLOAD_CACHEABLE_EXTENSIONS.has(ext)) {
          res.setHeader('Cache-Control', 'private, max-age=86400, must-revalidate');
        }
      },
    }));

    // 静态资源服务（带缓存策略）
    const STATIC_CACHE_MAX_AGE = 24 * 60 * 60; // 1天
    app.use(
      express.static(path.join(config.ROOT_DIR, 'public'), {
        index: 'index.html',
        dotfiles: 'ignore',
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          const ext = path.extname(filePath).toLowerCase();
          if (ext === '.html') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
          }
          if (STATIC_CACHEABLE_EXTENSIONS.has(ext)) {
            res.setHeader('Cache-Control', `public, max-age=${STATIC_CACHE_MAX_AGE}, must-revalidate`);
          }
        },
      })
    );

    // ========== API 路由 ==========
    app.use('/api', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/todos', todoRoutes);
    app.use('/api/media', mediaRoutes);
    app.use('/api/devices', devicesRoutes);
    app.use('/api/borrow-requests', borrowRoutes);
    app.use('/api/team', teamRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/audit-logs', auditRoutes);
    app.use('/api/topic-library', topicLibraryRoutes);
    app.use('/api/storage', storageRoutes);
    app.use('/api/registration-requests', registrationRequestRoutes);
    app.use('/api', systemRoutes); // system路由包含多个端点，挂载到/api

    // 健康检查（已包含在systemRoutes中，这里保留作为备份）
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // ========== 错误处理 ==========
    app.use(notFoundHandler);
    app.use(errorHandler);

    // ========== 启动服务器 ==========
    httpServer = app.listen(config.PORT, config.HOST, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀  ${config.SITE_TITLE}                              ║
║   ${config.SITE_SUBTITLE}                               ║
║                                                           ║
║   📡  本地: http://localhost:${config.PORT}              ║
║   🌐  网络: http://${require('os').networkInterfaces()?.['WLAN']?.[1]?.address || '获取中...'}:${config.PORT}      ║
║                                                           ║
║   📁  数据库: ${path.relative(process.cwd(), config.DB_PATH)}  ║
║   📤  上传: ${path.relative(process.cwd(), config.UPLOAD_DIR)}    ║
║                                                           ║
║   ⚙️   环境: ${process.env.NODE_ENV || 'development'}    ║
║   📝  日志: ${path.relative(process.cwd(), config.LOG_DIR)}        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);

      logServerEvent('info', 'server_started', {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        host: config.HOST,
        port: config.PORT,
      });
    });

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// ========== 进程错误处理 ==========
function gracefulShutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${reason} 信号，正在关闭服务器...`);

  const finalize = () => {
    try {
      stopMaintenanceScheduler();
      models.database.saveDatabaseNow();
    } catch (error) {
      console.error('关停期间最终落盘失败：', error);
    }
    process.exit(exitCode);
  };

  const forceTimer = setTimeout(() => {
    console.warn('优雅关停超时，强制退出');
    finalize();
  }, 8000);
  if (typeof forceTimer.unref === 'function') forceTimer.unref();

  if (httpServer) {
    httpServer.close((error) => {
      if (error) console.error('HTTP 服务关闭失败：', error);
      clearTimeout(forceTimer);
      finalize();
    });
  } else {
    clearTimeout(forceTimer);
    finalize();
  }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logServerEvent('fatal', 'uncaught_exception', { error });
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logServerEvent('fatal', 'unhandled_rejection', { reason });
  gracefulShutdown('unhandledRejection', 1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

// 启动应用
initApp();
