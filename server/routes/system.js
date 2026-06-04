const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { all, get, run, saveDatabase, transaction } = require('../models/database');
const { media: mediaModel, todo: todoModel, team: teamModel, device: deviceModel, borrow: borrowModel } = require('../models');
const config = require('../config');
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
  const row = get('SELECT value FROM settings WHERE key = ? LIMIT 1', [key]);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  const existing = get('SELECT key FROM settings WHERE key = ? LIMIT 1', [key]);
  if (existing) {
    run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, nowIso(), key]);
  } else {
    run('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      key,
      value,
      nowIso(),
      nowIso(),
    ]);
  }
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
  return {
    siteTitle: getSetting('siteTitle', config.SITE_TITLE),
    siteSubtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
    homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
    publicUrl: getSetting('publicUrl', config.PUBLIC_URL),
    adminUsername: getSetting('adminUsername', config.ADMIN_USERNAME),
    syncMessage: getSetting('syncMessage', '等待同步'),
    lastSyncAt: getSetting('lastSyncAt', ''),
  };
}

/**
 * 获取系统信息
 */
function getSystemInfo() {
  return {
    databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, '/'),
    uploadDir: 'server/uploads',
    inboxDir: 'server/uploads/inbox',
    inboxAutoScanSeconds: config.AUTO_SCAN_SECONDS || 30,
    maxUploadMb: config.MAX_UPLOAD_MB,
  };
}

/**
 * 构建bootstrap数据
 */
function buildBootstrap(user) {
  return {
    user,
    publicConfig: {
      siteTitle: getSetting('siteTitle', config.SITE_TITLE),
      siteSubtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
      homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
      publicUrl: getSetting('publicUrl', config.PUBLIC_URL),
    },
    site: {
      title: getSetting('siteTitle', config.SITE_TITLE),
      subtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
      homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
    },
    system: getSystemInfo(),
    settings: getSettings(),
    dashboard: getDashboard(),
    media: mediaModel.getAllMedia().map(m => mediaModel.mediaRowToItem(m)),
    todos: todoModel.getAllTodos(),
    activity: getAllActivity(),
    team: teamModel.getAllTeam(),
    devices: deviceModel.getAllDevices(),
    borrowRequests: borrowModel.getAllBorrowRequests(),
  };
}

/**
 * 构建完整备份
 */
function buildFullBackup() {
  const databaseExists = fs.existsSync(config.DB_PATH);
  const uploadFiles = 0; // TODO: count files recursively
  const mediaCount = get('SELECT COUNT(*) AS count FROM media').count;
  const todoCount = get('SELECT COUNT(*) AS count FROM todos').count;
  const activityCount = get('SELECT COUNT(*) AS count FROM activity').count;

  return {
    generatedAt: nowIso(),
    databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, '/'),
    databaseExists,
    uploadDir: 'server/uploads',
    uploadFiles,
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
    const siteTitle = String(body.siteTitle || '').trim();
    const siteSubtitle = String(body.siteSubtitle || '').trim();
    const homeHeroMessage = String(body.homeHeroMessage || '').trim();
    const publicUrl = String(body.publicUrl || '').trim();
    const adminUsername = String(body.adminUsername || '').trim();
    const adminPassword = String(body.adminPassword || '');

    transaction(() => {
      if (siteTitle) setSetting('siteTitle', siteTitle);
      if (siteSubtitle) setSetting('siteSubtitle', siteSubtitle);
      if (homeHeroMessage !== '') setSetting('homeHeroMessage', homeHeroMessage);
      if (publicUrl !== '') setSetting('publicUrl', publicUrl);
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

    res.json({ ok: true, settings: getSettings() });
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
