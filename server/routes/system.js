const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { all, get, run, saveDatabase, transaction } = require('../models/database');
const { media: mediaModel, todo: todoModel, team: teamModel, device: deviceModel, borrow: borrowModel, settings: settingsModel } = require('../models');
const config = require('../config');
const { hasPermission } = require('../config/permissions');
const { nowIso } = require('../utils');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

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
function getDashboard() {
  const deviceCount = get('SELECT COUNT(*) AS count FROM devices').count;
  const borrowOpenCount = get("SELECT COUNT(*) AS count FROM borrow_requests WHERE status = 'pending'").count;
  return {
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
    exportVersion: 2,
    data: {
      settings: getSettings(),
      team: teamModel.getAllTeam(),
      media: mediaModel.getAllMedia().map(m => mediaModel.mediaRowToItem(m)),
      todos: todoModel.getAllTodos(),
      activity: getAllActivity(),
      devices: deviceModel.getAllDevices(),
      borrowRequests: borrowModel.getAllBorrowRequests(),
      wishes: all('SELECT * FROM wishes ORDER BY datetime(created_at) DESC').map(wishRowToItem),
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

module.exports = router;
