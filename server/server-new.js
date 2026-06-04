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
const systemRoutes = require('./routes/system');

// 确保必要的目录存在
ensureDir(config.DATA_DIR);
ensureDir(config.LOG_DIR);
ensureDir(config.UPLOAD_DIR);
ensureDir(config.MEDIA_DIR);
ensureDir(config.AVATAR_DIR);
ensureDir(config.DEVICE_IMAGE_DIR);
ensureDir(config.INBOX_DIR);

const app = express();

// ========== 初始化数据库 ==========
async function initApp() {
  try {
    await models.database.initDatabase();
    console.log('✓ 数据库初始化成功');

    // 配置会话获取器
    setSessionGetter(models.session.getSession);

    // 清理过期会话和旧日志
    models.session.cleanupExpiredSessions();
    cleanupOldLogs();

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
    app.use('/uploads', requireAuthForUploads, express.static(config.UPLOAD_DIR));

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
          if (['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
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
    app.listen(config.PORT, config.HOST, () => {
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
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logServerEvent('fatal', 'uncaught_exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logServerEvent('fatal', 'unhandled_rejection', { reason });
});

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  models.database.saveDatabase();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  models.database.saveDatabase();
  process.exit(0);
});

// 启动应用
initApp();
