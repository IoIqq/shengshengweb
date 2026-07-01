const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { all, get, run, saveDatabase, transaction } = require('../models/database');
const { media: mediaModel, todo: todoModel, team: teamModel, device: deviceModel, borrow: borrowModel, settings: settingsModel, user: userModel, session: sessionModel, audit: auditModel, registrationRequest: registrationRequestModel } = require('../models');
const config = require('../config');
const { hasPermission } = require('../config/permissions');
const { nowIso } = require('../utils');
const { getLanAddresses } = require('../utils/network');
const { toSvg: qrToSvg } = require('../utils/qr-code');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');

// ── CPU 使用率采样（后台每 30 秒采样一次） ──
let cachedCpuUsage = 0;
let previousCpuTimes = null;

function sampleCpuUsage() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return;

  const currentTimes = cpus.map(cpu => cpu.times);

  if (previousCpuTimes) {
    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < cpus.length; i++) {
      const prev = previousCpuTimes[i];
      const curr = currentTimes[i];
      const idle = curr.idle - prev.idle;
      const total =
        (curr.user - prev.user) +
        (curr.nice - prev.nice) +
        (curr.sys - prev.sys) +
        (curr.irq - prev.irq) +
        idle;
      totalIdle += idle;
      totalTick += total;
    }

    cachedCpuUsage = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 1000) / 10 : 0;
  }

  previousCpuTimes = currentTimes;
}

// 启动时采样一次，然后每 30 秒采样
sampleCpuUsage();
setInterval(sampleCpuUsage, 30000);

// 获取系统总内存（MB）
function getTotalMemoryMB() {
  return Math.round(os.totalmem() / 1024 / 1024);
}

/**
 * 生成本地日期键
 */
function nowLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 获取/设置系统设置
 */
function getSetting(key, fallback = '') {
  return settingsModel.getSetting(key, fallback);
}

function setSetting(key, value) {
  return settingsModel.setSetting(key, value);
}

/**
 * 转换wish行为前端对象
 */
function wishRowToItem(row) {
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    mood: row.mood || '',
    anonymous: Boolean(row.anonymous),
    createdAt: row.created_at,
  };
}

/**
 * 活动日志行转换
 */
function activityRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    meta: row.meta,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

/**
 * 创建密码哈希
 */
function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

/**
 * 记录活动日志
 */
function logActivity(title, meta, detail) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`act-${timestamp}-${random}`, title, meta, detail, nowIso()],
  );
}

/**
 * 获取所有活动
 */
function getAllActivity() {
  return all('SELECT * FROM activity ORDER BY datetime(created_at) DESC').map(activityRowToItem);
}

/**
 * 获取仪表板数据
 */
/**
 * 获取素材盘容量占用（仅返回数字，不暴露任何路径，供所有角色的工作台环形图使用）
 */
function getStorageUsage() {
  const result = {
    capacityAvailable: false,
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    usedPercent: 0,
  };
  try {
    if (typeof fs.statfsSync !== 'function') return result;
    const root = path.parse(path.resolve(config.UPLOAD_DIR)).root || config.UPLOAD_DIR;
    const stats = fs.statfsSync(root);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const totalBytes = Number(stats.blocks || 0) * blockSize;
    const freeBytes = Number(stats.bavail || stats.bfree || 0) * blockSize;
    if (totalBytes > 0) {
      result.totalBytes = totalBytes;
      result.freeBytes = freeBytes;
      result.usedBytes = Math.max(0, totalBytes - freeBytes);
      result.usedPercent = Math.round((result.usedBytes / totalBytes) * 1000) / 10;
      result.capacityAvailable = true;
    }
  } catch (error) {
    // 容量读取失败时保持 capacityAvailable: false，前端显示占位
  }
  return result;
}

function getDashboard() {
  const deviceCount = get('SELECT COUNT(*) AS count FROM devices').count;
  const borrowOpenCount = get("SELECT COUNT(*) AS count FROM borrow_requests WHERE status = 'pending'").count;
  return {
    storage: getStorageUsage(),
    counts: {
      all: get('SELECT COUNT(*) AS count FROM media').count,
      pending: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'pending'").count,
      approved: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'approved'").count,
      photo: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'photo'").count,
      video: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'video'").count,
      todoOpen: get('SELECT COUNT(*) AS count FROM todos WHERE done = 0').count,
      devices: deviceCount,
      borrowOpen: borrowOpenCount,
    },
    recent: all('SELECT * FROM activity ORDER BY datetime(created_at) DESC LIMIT 8').map(activityRowToItem),
    syncMessage: getSetting('syncMessage', '等待同步'),
    lastSyncAt: getSetting('lastSyncAt', ''),
  };
}

/**
 * 获取站点设置
 */
function getSettings() {
  return settingsModel.getSettings();
}

function toDisplayPath(value) {
  const relativePath = path.relative(config.ROOT_DIR, value);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.replace(/\\/g, '/');
  }
  return String(value || '').replace(/\\/g, '/');
}

function countUploadFiles(limit = 5000) {
  const summary = { files: 0, truncated: false };
  if (!fs.existsSync(config.UPLOAD_DIR)) return summary;

  const stack = [config.UPLOAD_DIR];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      summary.truncated = true;
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        summary.files += 1;
        if (summary.files >= limit) {
          summary.truncated = true;
          return summary;
        }
      }
    }
  }

  return summary;
}

/**
 * 获取系统信息
 */
function getSystemInfo() {
  return {
    databasePath: toDisplayPath(config.DB_PATH),
    uploadDir: toDisplayPath(config.UPLOAD_DIR),
    inboxDir: toDisplayPath(config.INBOX_DIR),
    inboxAutoScanSeconds: config.AUTO_SCAN_SECONDS || 30,
    maxUploadMb: config.MAX_UPLOAD_MB,
  };
}

/**
 * 构建bootstrap数据
 */
function buildBootstrap(user) {
  const publicSettings = {
    siteTitle: getSetting('siteTitle', config.SITE_TITLE),
    siteSubtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
    homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
    publicUrl: getSetting('publicUrl', config.PUBLIC_URL),
  };
  const payload = {
    user,
    publicConfig: publicSettings,
    site: {
      title: publicSettings.siteTitle,
      subtitle: publicSettings.siteSubtitle,
      homeHeroMessage: publicSettings.homeHeroMessage,
    },
    dashboard: getDashboard(),
    media: mediaModel.getAllMedia().map(m => mediaModel.mediaRowToItem(m)),
    todos: todoModel.getAllTodos(),
    activity: getAllActivity(),
    team: teamModel.getAllTeam(),
  };

  if (hasPermission(user.role, 'device:read')) {
    payload.devices = deviceModel.getAllDevices();
  }

  if (hasPermission(user.role, 'borrow:read')) {
    payload.borrowRequests = borrowModel.getAllBorrowRequests();
  }

  if (user.role === 'admin') {
    payload.system = getSystemInfo();
    payload.settings = getSettings();
  }

  return payload;
}

/**
 * 构建完整备份
 */
function buildFullBackup() {
  const databaseExists = fs.existsSync(config.DB_PATH);
  const uploadSummary = countUploadFiles();
  const mediaCount = get('SELECT COUNT(*) AS count FROM media').count;
  const todoCount = get('SELECT COUNT(*) AS count FROM todos').count;
  const activityCount = get('SELECT COUNT(*) AS count FROM activity').count;

  return {
    generatedAt: nowIso(),
    databasePath: toDisplayPath(config.DB_PATH),
    databaseExists,
    uploadDir: toDisplayPath(config.UPLOAD_DIR),
    uploadFiles: uploadSummary.files,
    uploadFilesTruncated: uploadSummary.truncated,
    counts: {
      media: mediaCount,
      todos: todoCount,
      activity: activityCount,
    },
    exportVersion: 4,
    data: {
      // 导出原始行（snake_case 列名），恢复时按实际 schema 列回填，
      // 避免 camelCase 字段名与表结构不一致导致恢复失败。
      settings: all('SELECT * FROM settings'),
      team: all('SELECT * FROM team'),
      media: all('SELECT * FROM media'),
      todos: all('SELECT * FROM todos'),
      activity: all('SELECT * FROM activity'),
      devices: all('SELECT * FROM devices'),
      borrowRequests: all('SELECT * FROM borrow_requests'),
      wishes: all('SELECT * FROM wishes'),
      users: all('SELECT * FROM users'),
      sessions: all('SELECT * FROM sessions'),
      auditLogs: all('SELECT * FROM audit_logs'),
      registrationRequests: all('SELECT * FROM registration_requests'),
      topicLibrary: all('SELECT * FROM topic_library'),
    },
  };
}

// Rate limiters
const wishLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '留言过于频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const clientLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '客户端日志上报过于频繁。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Routes

// GET /api/bootstrap - Get application initialization data
router.get('/bootstrap', requireAuth, (req, res) => {
  try {
    res.json(buildBootstrap(req.user));
  } catch (error) {
    res.status(500).json({ error: '加载初始化数据失败。' });
  }
});

// GET /api/backup - Export full backup as JSON
router.get('/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const payload = buildFullBackup();
    const filename = `backup-${nowLocalDateKey()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: '导出备份失败。' });
  }
});

// GET /api/backup/database - Export SQLite database file
router.get('/backup/database', requireAuth, requireAdmin, (req, res) => {
  try {
    saveDatabase(); // Ensure database is persisted

    if (!fs.existsSync(config.DB_PATH)) {
      return res.status(404).json({ error: '数据库文件不存在。' });
    }

    const filename = `studio-${nowLocalDateKey()}.sqlite`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(config.DB_PATH);
  } catch (error) {
    res.status(500).json({ error: '导出数据库失败。' });
  }
});

// POST /api/backup/restore - Restore data from JSON backup
/**
 * 恢复表映射：前端勾选值 -> { 表名, 备份 JSON 中的数据键 }
 * 注意 topics 勾选值对应实际表名 topic_library。
 */
const RESTORE_TABLE_MAP = {
  todos: { table: 'todos', dataKey: 'todos' },
  devices: { table: 'devices', dataKey: 'devices' },
  borrow_requests: { table: 'borrow_requests', dataKey: 'borrowRequests' },
  team: { table: 'team', dataKey: 'team' },
  users: { table: 'users', dataKey: 'users' },
  settings: { table: 'settings', dataKey: 'settings' },
  audit_logs: { table: 'audit_logs', dataKey: 'auditLogs' },
  activity: { table: 'activity', dataKey: 'activity' },
  sessions: { table: 'sessions', dataKey: 'sessions' },
  registration_requests: { table: 'registration_requests', dataKey: 'registrationRequests' },
  wishes: { table: 'wishes', dataKey: 'wishes' },
  media: { table: 'media', dataKey: 'media' },
  topics: { table: 'topic_library', dataKey: 'topicLibrary' },
};

/**
 * 读取某张表的实际列名（PRAGMA table_info）
 */
function getTableColumns(tableName) {
  return all(`PRAGMA table_info(${tableName})`).map((r) => r.name);
}

/**
 * 通用表恢复：先清空再按行回填。仅写入同时存在于行数据与当前 schema 的列，
 * 避免备份字段名/顺序与表结构不一致导致整批失败。每张表独立事务，单表失败不影响其它表。
 */
function restoreRows(tableName, rows) {
  const schemaCols = new Set(getTableColumns(tableName));
  return transaction(() => {
    run(`DELETE FROM ${tableName}`);
    if (!rows.length) return 0;
    let inserted = 0;
    for (const row of rows) {
      const cols = Array.from(schemaCols).filter((c) => Object.prototype.hasOwnProperty.call(row, c));
      if (cols.length === 0) continue;
      const colSql = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map(() => '?').join(', ');
      run(`INSERT INTO ${tableName} (${colSql}) VALUES (${placeholders})`, cols.map((c) => row[c]));
      inserted += 1;
    }
    return inserted;
  });
}

router.post('/backup/restore', requireAuth, requireAdmin, (req, res) => {
  try {
    const { tables, data } = req.body || {};

    if (!Array.isArray(tables) || tables.length === 0) {
      return res.status(400).json({ error: '请指定要恢复的数据表。' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '备份数据无效。' });
    }

    const invalid = tables.filter((t) => !RESTORE_TABLE_MAP[t]);
    if (invalid.length > 0) {
      return res.status(400).json({ error: `不支持的表: ${invalid.join(', ')}` });
    }

    const restored = [];
    const failed = [];

    for (const key of tables) {
      const entry = RESTORE_TABLE_MAP[key];
      const rows = Array.isArray(data[entry.dataKey]) ? data[entry.dataKey] : [];
      try {
        const count = restoreRows(entry.table, rows);
        restored.push(`${key}(${count})`);
      } catch (e) {
        failed.push({ table: key, error: e.message || String(e) });
      }
    }

    saveDatabase();
    logActivity(
      '数据恢复',
      '管理员恢复备份',
      failed.length
        ? `已恢复: ${restored.join(', ')}；失败: ${failed.map((f) => f.table).join(', ')}`
        : `已恢复表: ${restored.join(', ')}`,
    );

    if (restored.length === 0) {
      return res.status(500).json({ error: `恢复失败: ${failed.map((f) => f.error).join('; ')}` });
    }

    res.json({ ok: true, restored, failed });
  } catch (error) {
    console.error('恢复备份失败:', error);
    res.status(500).json({ error: '恢复备份失败: ' + (error.message || '未知错误') });
  }
});

// GET /api/settings - Get site settings
router.get('/settings', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(getSettings());
  } catch (error) {
    res.status(500).json({ error: '获取设置失败。' });
  }
});

// PATCH /api/settings - Update site settings
router.patch('/settings', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const updates = {
      siteTitle: body.siteTitle,
      siteSubtitle: body.siteSubtitle,
      homeHeroMessage: body.homeHeroMessage,
      publicUrl: body.publicUrl,
      showcaseEnabled: body.showcaseEnabled,
      showcaseBrand: body.showcaseBrand,
      showcaseHeroLabel: body.showcaseHeroLabel,
      showcaseTitle: body.showcaseTitle,
      showcaseSubtitle: body.showcaseSubtitle,
      showcaseFooterText: body.showcaseFooterText,
      showcaseLimit: body.showcaseLimit,
      showcaseKindFilter: body.showcaseKindFilter,
    };
    const adminUsername = String(body.adminUsername || '').trim();
    const adminPassword = String(body.adminPassword || '');

    const settings = settingsModel.updateSettings(updates);

    transaction(() => {
      if (adminUsername) {
        setSetting('adminUsername', adminUsername);
        const adminUser = get("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
        if (adminUser) {
          run('UPDATE users SET username = ?, updated_at = ? WHERE id = ?', [adminUsername, nowIso(), adminUser.id]);
        }
      }
      if (adminPassword) {
        const adminUser = get("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
        if (adminUser) {
          const { salt, hash } = createPasswordHash(adminPassword);
          run('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', [
            hash,
            salt,
            nowIso(),
            adminUser.id,
          ]);
        }
      }
      logActivity('站点设置更新', '管理员保存', '站点基础设置已更新。');
    });
    saveDatabase();

    res.json({ ok: true, settings });
  } catch (error) {
    res.status(500).json({ error: '更新设置失败。' });
  }
});

// GET /api/wishes - Get wish wall messages
router.get('/wishes', (req, res) => {
  try {
    const wishes = all('SELECT * FROM wishes ORDER BY datetime(created_at) DESC LIMIT 100');
    res.json(wishes.map(wishRowToItem));
  } catch (error) {
    res.status(500).json({ error: '加载留言失败。' });
  }
});

// POST /api/wishes - Create wish message
router.post('/wishes', requireAuth, wishLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const content = String(body.content || '').trim();
    const mood = String(body.mood || '').trim().slice(0, 10);
    const anonymous = Boolean(body.anonymous);

    if (!content) {
      return res.status(400).json({ error: '留言内容不能为空。' });
    }
    if (content.length > 200) {
      return res.status(400).json({ error: '留言内容不能超过 200 字。' });
    }

    const author = anonymous ? '匿名用户' : (req.user?.username || '访客');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    const item = {
      id: `wish-${timestamp}-${random}`,
      content,
      author,
      mood,
      anonymous: anonymous ? 1 : 0,
      created_at: nowIso(),
    };

    run(
      `INSERT INTO wishes (id, content, author, mood, anonymous, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, item.content, item.author, item.mood, item.anonymous, item.created_at],
    );
    saveDatabase();

    res.json(wishRowToItem(item));
  } catch (error) {
    res.status(500).json({ error: '发布留言失败。' });
  }
});

// DELETE /api/wishes/:id - Delete wish message
router.delete('/wishes/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const existing = get('SELECT * FROM wishes WHERE id = ? LIMIT 1', [id]);

    if (!existing) {
      return res.status(404).json({ error: '留言不存在。' });
    }

    run('DELETE FROM wishes WHERE id = ?', [id]);
    saveDatabase();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: '删除留言失败。' });
  }
});

// GET /api/health - Health check
router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', timestamp: nowIso() });
});

// POST /api/client-log - Client-side error logging
router.post('/client-log', clientLogLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'client error';
    const category = typeof body.category === 'string' ? body.category.slice(0, 80) : 'client';

    // Log to console or file (simplified)
    console.error('[CLIENT LOG]', {
      message,
      category,
      page: typeof body.page === 'string' ? body.page.slice(0, 200) : req.get('referer') || '',
      userAgent: (req.get('user-agent') || '').slice(0, 200),
      role: req.user?.role || 'guest',
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: '日志记录失败。' });
  }
});

// ── 系统管理面板 API ──

// GET /api/system/info — 系统详情（管理员）
router.get('/system/info', requireAuth, requireAdmin, (req, res) => {
  try {
    const mem = process.memoryUsage();
    const dbExists = fs.existsSync(config.DB_PATH);
    let dbSize = 0;
    if (dbExists) {
      try { dbSize = fs.statSync(config.DB_PATH).size; } catch (e) { /* ignore */ }
    }

    const uploadCount = (() => {
      let n = 0;
      if (fs.existsSync(config.UPLOAD_DIR)) {
        try {
          const walk = (dir) => {
            fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
              if (e.isDirectory()) walk(path.join(dir, e.name));
              else n++;
            });
          };
          walk(config.UPLOAD_DIR);
        } catch (e) { /* ignore */ }
      }
      return n;
    })();

    res.json({
      nodeVersion: process.version,
      platform: process.platform,
      hostname: os.hostname(),
      cpuCores: os.cpus().length,
      cpuUsage: cachedCpuUsage,
      totalMemory: getTotalMemoryMB(),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
      port: config.PORT,
      database: {
        path: config.DB_PATH.replace(/\\/g, '/'),
        sizeBytes: dbSize,
        exists: dbExists,
      },
      uploadDir: {
        path: config.UPLOAD_DIR.replace(/\\/g, '/'),
        fileCount: uploadCount,
      },
      pm2: {
        isPM2: !!(process.env.pm_id || process.env.PM2_HOME),
        id: process.env.pm_id || null,
      },
      lanAddresses: getLanAddresses(),
    });
  } catch (error) {
    res.status(500).json({ error: '获取系统信息失败。' });
  }
});

// GET /api/system/logs — 查看日志（管理员）
router.get('/system/logs', requireAuth, requireAdmin, (req, res) => {
  try {
    const maxLines = Math.min(parseInt(req.query.lines, 10) || 50, 200);

    // 支持按日期查询：?date=YYYYMMDD 或 ?date=YYYY-MM-DD
    let dateStr;
    const dateParam = req.query.date;
    if (dateParam) {
      // 接受 YYYYMMDD 或 YYYY-MM-DD 格式
      const cleaned = String(dateParam).replace(/-/g, '');
      if (/^\d{8}$/.test(cleaned)) {
        dateStr = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
      } else {
        return res.status(400).json({ error: '日期格式无效，请使用 YYYYMMDD 或 YYYY-MM-DD' });
      }
    } else {
      const now = new Date();
      dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const logFile = path.join(config.ROOT_DIR, 'server', 'logs', `${dateStr}.log`);

    if (!fs.existsSync(logFile)) {
      return res.json({ lines: [], file: `${dateStr}.log`, totalLines: 0, message: `${dateStr} 暂无日志` });
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    const allLines = content.split(/\r?\n/).filter(Boolean);
    const totalLines = allLines.length;
    const lines = allLines.slice(-maxLines);

    res.json({ lines, file: `${dateStr}.log`, totalLines, date: dateStr });
  } catch (error) {
    res.status(500).json({ error: '读取日志失败。' });
  }
});

// GET /api/system/logs/list — 列出所有可用日志文件（管理员）
router.get('/system/logs/list', requireAuth, requireAdmin, (req, res) => {
  try {
    const logDir = path.join(config.ROOT_DIR, 'server', 'logs');

    if (!fs.existsSync(logDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const match = f.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
        return match ? { date: match[1], filename: f } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date)); // 最新的在前

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: '获取日志列表失败。' });
  }
});

// GET /api/system/network — 网络信息 + 二维码（管理员）
router.get('/system/network', requireAuth, requireAdmin, (req, res) => {
  try {
    const lan = getLanAddresses();
    const primary = lan.length > 0 ? lan[0].address : 'localhost';
    const url = `http://${primary}:${config.PORT}`;
    let qrSvg = '';
    try {
      qrSvg = qrToSvg(url, 4);
    } catch (e) {
      qrSvg = '';
    }

    res.json({
      lanAddresses: lan,
      primaryUrl: url,
      qrSvg,
      port: config.PORT,
    });
  } catch (error) {
    res.status(500).json({ error: '获取网络信息失败。' });
  }
});

// POST /api/system/restart — 重启服务（管理员）
router.post('/system/restart', requireAuth, requireAdmin, (req, res) => {
  try {
    logActivity('服务重启', '管理员操作', '管理员从控制面板触发服务重启。');
    saveDatabase();

    const isPM2 = !!(process.env.pm_id || process.env.PM2_HOME);

    // 先返回成功，再延迟执行重启
    res.json({ ok: true, message: '服务将在 2 秒后重启', pm2: isPM2 });

    setTimeout(() => {
      try {
        if (isPM2) {
          // PM2 模式下使用 pm2 restart 命令
          spawn('pm2', ['restart', 'shengsheng-studio'], {
            detached: true,
            stdio: 'ignore',
            shell: true,
          });
        } else {
          // 独立 Node.js 模式：启动新实例后退出当前进程
          const nodeArgs = [path.join(config.ROOT_DIR, 'server', 'server-new.js')];
          const child = spawn(process.execPath, nodeArgs, {
            detached: true,
            stdio: 'ignore',
            env: process.env,
            cwd: config.ROOT_DIR,
          });
          child.unref();

          // 等待新实例启动后退出
          setTimeout(() => {
            console.log('[RESTART] 旧实例退出');
            process.exit(0);
          }, 3000);
        }
      } catch (restartErr) {
        console.error('[RESTART] 重启失败:', restartErr);
      }
    }, 2000);
  } catch (error) {
    res.status(500).json({ error: '触发重启失败。' });
  }
});

// ── 维护操作（cleanup / snapshot / wipe） ──

const BACKUPS_DIR = path.join(config.ROOT_DIR, 'server', 'backups');

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

// POST /api/system/sessions/cleanup — 删除 expires_at < now 的会话（管理员）
router.post('/system/sessions/cleanup', requireAuth, requireAdmin, (req, res) => {
  try {
    const before = get('SELECT COUNT(*) AS count FROM sessions').count;
    sessionModel.cleanupExpiredSessions();
    const after = get('SELECT COUNT(*) AS count FROM sessions').count;
    saveDatabase();
    const deleted = Math.max(0, before - after);
    logActivity('清理过期会话', '管理员操作', `删除 ${deleted} 条过期 session。`);
    res.json({ ok: true, deleted });
  } catch (error) {
    res.status(500).json({ error: '清理过期会话失败。' });
  }
});

// POST /api/backup/snapshot — 在 server/backups/ 写一份完整快照（管理员）
router.post('/backup/snapshot', requireAuth, requireAdmin, (req, res) => {
  try {
    ensureBackupsDir();
    const payload = buildFullBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot-${stamp}.json`;
    const fullPath = path.join(BACKUPS_DIR, filename);
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf-8');
    const stat = fs.statSync(fullPath);
    logActivity('备份快照', '管理员操作', `${filename}（${stat.size} 字节）`);
    res.json({ ok: true, name: filename, size: stat.size, createdAt: stat.mtime.toISOString() });
  } catch (error) {
    res.status(500).json({ error: '生成备份快照失败。' });
  }
});

// GET /api/backup/snapshots — 列出 server/backups/ 下的快照（按时间倒序，最多 20）
router.get('/backup/snapshots', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return res.json({ items: [] });
    const items = fs.readdirSync(BACKUPS_DIR)
      .filter(name => /^snapshot-.+\.json$/.test(name))
      .map(name => {
        const full = path.join(BACKUPS_DIR, name);
        const stat = fs.statSync(full);
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: '列出备份快照失败。' });
  }
});

// GET /api/backup/snapshots/:name/download — 下载指定快照文件（管理员）
router.get('/backup/snapshots/:name/download', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.name;
  if (!/^snapshot-.+.json$/.test(name)) return res.status(400).json({ error: '无效的快照文件名。' });
  const fullPath = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: '快照文件不存在。' });
  res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.sendFile(fullPath);
});

// DELETE /api/backup/snapshots/:name — 删除指定快照文件（管理员）
router.delete('/backup/snapshots/:name', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.name;
  if (!/^snapshot-.+.json$/.test(name)) return res.status(400).json({ error: '无效的快照文件名。' });
  const fullPath = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: '快照文件不存在。' });
  try {
    fs.unlinkSync(fullPath);
    logActivity('删除快照', '管理员操作', name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除快照失败。' });
  }
});

// POST /api/system/wipe — 清空业务表，保留 admin 账号与当前 session（管理员）
// body: { confirm: '删除' }
router.post('/system/wipe', requireAuth, requireAdmin, (req, res) => {
  try {
    if (req.body?.confirm !== '删除') {
      return res.status(400).json({ error: '请按提示输入"删除"以确认本次清空操作。' });
    }
    const currentSessionToken = req.session?.token || req.user?.sessionToken || null;
    const adminUser = req.user;

    const summary = { tables: [] };

    transaction(() => {
      // 业务表全清
      const businessTables = [
        'media', 'todos', 'devices', 'borrow_requests',
        'team', 'wishes', 'topic_library', 'activity',
        'audit_logs', 'registration_requests',
      ];
      for (const t of businessTables) {
        try {
          const before = get(`SELECT COUNT(*) AS count FROM ${t}`).count;
          run(`DELETE FROM ${t}`);
          summary.tables.push({ table: t, deleted: before });
        } catch (e) {
          summary.tables.push({ table: t, deleted: 0, skipped: true });
        }
      }
      // 用户：保留 admin 角色或当前操作者
      if (adminUser?.id) {
        run('DELETE FROM users WHERE role <> ? AND id <> ?', ['admin', adminUser.id]);
      } else {
        run("DELETE FROM users WHERE role <> 'admin'");
      }
      // 会话：保留当前会话，避免操作者被踢
      if (currentSessionToken) {
        run('DELETE FROM sessions WHERE token <> ?', [currentSessionToken]);
      }
    });

    saveDatabase();
    logActivity('清空数据', '管理员操作', JSON.stringify(summary));
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ error: error.message || '清空数据失败。' });
  }
});

module.exports = router;
