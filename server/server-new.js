require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const https = require('https');

// 导入配置和工具
const config = require('./config');
const { ensureDir } = require('./utils');
const { getLanAddresses, findAvailablePort } = require('./utils/network');
const { cleanupOldLogs, logServerEvent } = require('./utils/logger');
const { getAssetVersion, refreshAssetVersion } = require('./utils/asset-version');
const { requestLogger, errorHandler, notFoundHandler } = require('./middleware');
const { csrfProtect } = require('./middleware/csrf');
const { setSessionGetter } = require('./middleware/auth');
const { startMaintenanceScheduler, stopMaintenanceScheduler } = require('./utils/maintenance-scheduler');

// 导入模型
const models = require('./models');
const transfer = require('./models/transfer');

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
const filesRoutes = require('./routes/files');
const monitorRoutes = require('./routes/monitor');
const servicesRoutes = require('./routes/services');
const hostRoutes = require('./routes/host');
const dhcpRoutes = require('./routes/dhcp');
const feishuSyncRoutes = require('./routes/feishu-sync');

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
ensureOptionalStorageDir('暂存目录', config.STAGING_DIR);
config.STORAGE_DIR_STATUS = storageDirStatus;

const app = express();
let httpServer = null;
let shuttingDown = false;
let hasherTimer = null;

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

    // 恢复上次中断的传输任务
    try {
      const recovered = transfer.recoverPendingTransfers();
      if (recovered.recovered) console.log(`✓ 恢复 ${recovered.recovered} 个中断传输任务`);
    } catch (error) {
      console.warn('传输恢复失败：', error.message);
    }

    // 空闲渐进哈希定时器：周期性为未哈希素材补算 SHA-256
    function tickHasher() {
      models.media.scanHashes(config.TRANSFER_HASH_BATCH)
        .catch(() => {})
        .finally(() => {
          hasherTimer = setTimeout(tickHasher, config.AUTO_SCAN_SECONDS * 1000);
          if (typeof hasherTimer.unref === 'function') hasherTimer.unref();
        });
    }
    hasherTimer = setTimeout(tickHasher, config.AUTO_SCAN_SECONDS * 1000);
    if (typeof hasherTimer.unref === 'function') hasherTimer.unref();

    // 周期性维护：清理 sessions / audit_logs / activity
    startMaintenanceScheduler(models);

    // ========== 中间件配置 ==========
    if (config.TRUST_PROXY) {
      app.set('trust proxy', 1);
    }

    // 安全头
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            mediaSrc: ["'self'", 'blob:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS：明确指定允许的来源；PUBLIC_URL 未配置时禁止跨域（同源SPA不需要CORS）
    app.use(cors({
      origin: config.PUBLIC_URL || false,
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

    // —— 资产版本注入：index.html 与 service-worker.js 启动时按 mtime 自动改版 ——
    const ASSET_VERSION = getAssetVersion();
    const PUBLIC_DIR = path.join(config.ROOT_DIR, 'public');
    const indexHtmlTemplate = fs
      .readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
      .replace(/__ASSET_VERSION__/g, ASSET_VERSION);
    const serviceWorkerTemplate = fs
      .readFileSync(path.join(PUBLIC_DIR, 'service-worker.js'), 'utf8')
      .replace(/__ASSET_VERSION__/g, ASSET_VERSION);
    console.log(`✓ ASSET_VERSION = ${ASSET_VERSION}`);
    const mainCssTemplate = fs
      .readFileSync(path.join(PUBLIC_DIR, 'css/main.css'), 'utf8')
      .replace(/__ASSET_VERSION__/g, ASSET_VERSION);

    app.get(['/', '/index.html'], (req, res) => {
      const isProd = process.env.NODE_ENV === 'production';
      const html = isProd
        ? indexHtmlTemplate
        : fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
            .replace(/__ASSET_VERSION__/g, refreshAssetVersion());
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.type('html').send(html);
    });

    app.get('/service-worker.js', (req, res) => {
      const isProd = process.env.NODE_ENV === 'production';
      const js = isProd
        ? serviceWorkerTemplate
        : fs.readFileSync(path.join(PUBLIC_DIR, 'service-worker.js'), 'utf8')
            .replace(/__ASSET_VERSION__/g, refreshAssetVersion());
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Service-Worker-Allowed', '/');
      res.type('application/javascript').send(js);
    });

    app.get('/css/main.css', (req, res) => {
      const isProd = process.env.NODE_ENV === 'production';
      const css = isProd
        ? mainCssTemplate
        : fs.readFileSync(path.join(PUBLIC_DIR, 'css/main.css'), 'utf8')
            .replace(/__ASSET_VERSION__/g, refreshAssetVersion());
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.type('text/css').send(css);
    });

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
    app.use('/api/files', filesRoutes);
    app.use('/api/monitor', monitorRoutes);
    app.use('/api/services', servicesRoutes);
    app.use('/api/host', hostRoutes);
    app.use('/api/dhcp', dhcpRoutes);
    app.use('/api/feishu-sync', feishuSyncRoutes);

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
    // 自动选一个空闲端口：首选 config.PORT，被占用则按 PORT_FALLBACKS 回退。
    const listenPort = await findAvailablePort(config.PORT, config.PORT_FALLBACKS, config.HOST);
    if (!listenPort) {
      console.error(`❌ 端口 ${config.PORT} 及所有备用端口都被占用，无法启动。`);
      console.error('   可在 .env 里设置一个新的 PORT，或关闭占用端口的程序后重试。');
      process.exit(1);
    }
    if (listenPort !== config.PORT) {
      console.warn(`⚠️  端口 ${config.PORT} 被占用，已自动改用 ${listenPort}。`);
    }
    config.PORT = listenPort;

    // 检测 TLS 证书（server/certs/cert.pem + key.pem）
    const certsDir = path.join(config.ROOT_DIR, 'server', 'certs');
    let sslOptions = null;
    try {
      const certFile = path.join(certsDir, 'cert.pem');
      const keyFile  = path.join(certsDir, 'key.pem');
      if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        sslOptions = { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
      }
    } catch (e) {
      console.warn('⚠️  TLS 证书读取失败，回退到 HTTP：', e.message);
    }
    if (!sslOptions) {
      console.warn('⚠️  未找到 TLS 证书（server/certs/cert.pem + key.pem），以明文 HTTP 启动。');
      console.warn('   生产环境建议运行 scripts/generate-cert.bat 生成自签名证书，或由反向代理处理 TLS。');
    }

    const scheme = sslOptions ? 'https' : 'http';

    // 实时探测当前网络的局域网地址（切换 Wi-Fi / 有线后会自动反映）
    const lanAddresses = getLanAddresses();
    const networkUrl = lanAddresses.length
      ? `${scheme}://${lanAddresses[0].address}:${listenPort}`
      : '（未连接局域网）';

    // 飞书多维表格同步：启用则启动后台定时拉取（unref，不阻止退出）
    if (config.FEISHU.enabled) {
      const feishuSyncService = require('./services/feishu-sync');
      const intervalMs = config.FEISHU.intervalSec * 1000;
      setInterval(() => { feishuSyncService.runSync().catch((e) => console.error('[Feishu] 定时同步异常:', e?.message || e)); }, intervalMs).unref();
      // 启动后稍延后跑一次，避免与 DB 初始化/端口探测抢资源
      setTimeout(() => { feishuSyncService.runSync().catch(() => {}); }, 8000).unref();
      console.log(`🔁  飞书同步已启用：每 ${config.FEISHU.intervalSec}s 拉取一次设备申请`);
    } else if (process.env.FEISHU_SYNC_ENABLED && String(process.env.FEISHU_SYNC_ENABLED) !== '0') {
      console.warn('⚠️  飞书同步已开启但配置不完整（缺 FEISHU_APP_ID/APP_SECRET/APP_TOKEN/TABLE_ID），已跳过。');
    }

    const onListening = () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🚀  ${config.SITE_TITLE}
║   ${config.SITE_SUBTITLE}
║
║   📡  本地: ${scheme}://localhost:${listenPort}
║   🌐  网络: ${networkUrl}
║
║   📁  数据库: ${path.relative(process.cwd(), config.DB_PATH)}
║   📤  上传: ${path.relative(process.cwd(), config.UPLOAD_DIR)}
║   ⚙️   环境: ${process.env.NODE_ENV || 'development'}
║   🔒  TLS:  ${sslOptions ? '已启用（自签名/自定义证书）' : '未启用（HTTP 明文）'}
╚═══════════════════════════════════════════════════════════╝`);

      if (lanAddresses.length > 1) {
        console.log('\n   其他可用网络地址（换网络时可试）：');
        for (const ip of lanAddresses.slice(1)) {
          console.log(`     • ${scheme}://${ip.address}:${listenPort}  [${ip.name}]`);
        }
      }
      console.log('\n   📱 手机访问 / 二维码：运行  npm run network\n');

      logServerEvent('info', 'server_started', {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        host: config.HOST,
        port: listenPort,
        tls: !!sslOptions,
        lanAddresses: lanAddresses.map((ip) => ip.address),
      });
    };

    httpServer = sslOptions
      ? https.createServer(sslOptions, app).listen(listenPort, config.HOST, onListening)
      : app.listen(listenPort, config.HOST, onListening);

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
      if (hasherTimer) { clearTimeout(hasherTimer); hasherTimer = null; }
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
