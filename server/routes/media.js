const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { media: mediaModel, settings: settingsModel } = require('../models');
const { requireAuth, requireEditor, requireAdmin, requirePermission } = require('../middleware/auth');
const config = require('../config');
const { nowIso, ensureDir } = require('../utils');

// Rate limiter for uploads
const rateLimit = require('express-rate-limit');
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '上传过于频繁,请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Multer configuration for media upload
const ALLOWED_MEDIA_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
  '.mp4', '.webm', '.mov', '.m4v', '.ogg',
]);

function isMediaFile(file) {
  if (!file || !file.mimetype) return false;
  const mimeOk = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  if (!mimeOk) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ALLOWED_MEDIA_EXTS.has(ext);
}

// 暂存式上传：每请求一个 jobId，文件落到 STAGING_DIR/<jobId>/
function generateJobId(req, _res, next) {
  if (!req.transferJobId) {
    const transfer = require('../models/transfer');
    req.transferJobId = transfer.createJobId();
    ensureDir(transfer.getStagingDir(req.transferJobId));
  }
  next();
}

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const transfer = require('../models/transfer');
      cb(null, transfer.getStagingDir(req.transferJobId));
    },
    filename(req, file, cb) {
      // 暂存用随机名避免冲突，original_filename 单独存
      const ext = path.extname(file.originalname || '').toLowerCase();
      const rand = Math.random().toString(36).substring(2, 8);
      cb(null, `stage-${Date.now()}-${rand}${ext}`);
    },
  }),
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    // 不设 files 上限（前端分批规避）；multer 不传 files 即不限制单请求数量
  },
  fileFilter(req, file, cb) {
    if (isMediaFile(file)) {
      return cb(null, true);
    }
    const error = new Error('只能上传图片或视频文件。');
    error.statusCode = 400;
    cb(error);
  },
});

// Helper functions
function createThumb(title, primaryColor, secondaryColor, kind) {
  const label = kind === 'video' ? '视频' : '图片';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="${primaryColor}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${secondaryColor}" font-size="14" font-family="sans-serif">${label}</text></svg>`)}`;
}

function logActivity(title, meta, detail) {
  const { run } = require('../models/database');
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`act-${timestamp}-${random}`, title, meta, detail, nowIso()],
  );
}

function resolveManagedMediaPath(sourceType, sourcePath) {
  if (!sourcePath) return null;
  const normalizedPath = String(sourcePath).replace(/\\/g, '/').replace(/^\/+/, '');
  const baseDir = sourceType === 'upload' ? config.MEDIA_DIR : sourceType === 'inbox' ? config.INBOX_DIR : null;
  if (!baseDir) return null;

  const resolvedPath = path.resolve(config.UPLOAD_DIR, normalizedPath);
  const relativePath = path.relative(baseDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return resolvedPath;
}

function cleanupManagedMediaFile(row, req) {
  if (!row) return { skipped: true, reason: 'missing_row' };
  const sourceType = String(row.source_type || '').toLowerCase();
  const MANAGED_MEDIA_SOURCE_TYPES = new Set(['upload', 'inbox']);

  if (!MANAGED_MEDIA_SOURCE_TYPES.has(sourceType)) {
    return { skipped: true, reason: 'non_local_source' };
  }

  const targetPath = resolveManagedMediaPath(sourceType, row.source_path);
  if (!targetPath) {
    return { skipped: true, reason: 'unsafe_path' };
  }

  try {
    fs.unlinkSync(targetPath);
    return { deleted: true, targetPath };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      // Log error but don't throw
    }
    return { skipped: true, reason: error?.code || 'unlink_failed', targetPath };
  }
}

// Routes

// GET /api/media/showcase - Public showcase (no auth required)
router.get('/showcase', (req, res) => {
  try {
    const settings = settingsModel.getPublicShowcaseSettings();
    const items = settings.enabled ? mediaModel.getShowcaseItems(settings) : [];
    res.json({ ok: true, settings, items });
  } catch (error) {
    res.status(500).json({ error: '展示内容加载失败。' });
  }
});

// POST /api/media/sync - Sync server media from inbox
router.post('/sync', requireAuth, requireEditor, (req, res) => {
  try {
    const { scanInbox } = mediaModel;
    const result = scanInbox();
    res.json({ ok: true, imported: result.imported.length, items: result.imported });
  } catch (error) {
    res.status(500).json({ error: '素材同步失败。' });
  }
});

// POST /api/media/upload - Staged 批量上传，附带目标归档信息
router.post(
  '/upload',
  uploadLimiter,
  requireAuth,
  requirePermission('media:create'),
  generateJobId,
  (req, res, next) => {
    mediaUpload.array('files')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `文件大小超过${config.MAX_UPLOAD_MB}MB限制。` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: '上传字段名不正确，请使用"files"字段。' });
        }
        if (err.statusCode === 400) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: '文件上传失败，请重试。' });
      }
      next();
    });
  },
  (req, res) => {
    const { transaction, saveDatabase } = require('../models/database');
    const { insertMediaRecord, mediaRowToItem } = mediaModel;
    const transfer = require('../models/transfer');
    const { buildTargetRelPath, sanitizeSegment } = require('../utils/media-paths');
    const deviceModel = require('../models').device;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: '请先选择要上传的文件。' });
    }

    const mode = req.body.mode === 'existing' ? 'existing' : 'new';
    const date = req.body.date || '';
    const eventName = req.body.eventName || '';
    const deviceId = req.body.deviceId || '';
    const existingPath = req.body.existingPath || '';

    // 目标活动段：existing 模式用 existingPath；new 模式按约定生成并取到活动段
    let targetDirRel;
    if (mode === 'existing' && existingPath) {
      targetDirRel = existingPath; // 形如 media/2026/20260622物流运动会
    } else {
      if (!date || !eventName) {
        return res.status(400).json({ error: '新建文件夹需要日期和活动名。' });
      }
      const built = buildTargetRelPath({ date, eventName, deviceName: 'tmp' });
      const parts = built.split('/');
      targetDirRel = parts.slice(0, 3).join('/'); // media/年/活动
    }
    if (!targetDirRel.startsWith('media/')) {
      return res.status(400).json({ error: '目标文件夹路径非法。' });
    }

    // 设备名：优先前端传入，否则按 deviceId 查 devices 表
    let deviceName = sanitizeSegment(req.body.deviceName || '');
    if (!deviceName && deviceId) {
      const dev = deviceModel.getDeviceById(deviceId);
      if (dev) deviceName = sanitizeSegment(dev.name);
    }
    if (!deviceName) deviceName = '未分类';
    targetDirRel = `${targetDirRel}/${deviceName}`;

    const jobId = req.transferJobId;
    const stagedRecords = [];
    const items = transaction(() => {
      const out = [];
      for (const file of files) {
        const kind = file.mimetype.startsWith('video/') ? 'video' : 'photo';
        const ext = path.extname(file.originalname || '').toLowerCase();
        const baseName = sanitizeSegment(path.basename(file.originalname || `file${ext}`, ext)) || `file-${Date.now()}`;
        const relName = `${baseName}${ext}`;
        const sourcePath = `${targetDirRel}/${relName}`;
        const publicUrl = `/uploads/${encodeURI(sourcePath)}`;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const record = {
          id: `media-${timestamp}-${random}`,
          kind,
          title: baseName,
          source: `本地上传 / ${file.originalname}`,
          source_type: 'upload',
          source_path: sourcePath,
          author: req.user?.username || '工作台',
          duration: kind === 'video' ? '本地视频' : '本地图片',
          status: '待审',
          note: '由浏览器上传到本地素材库。',
          tags_json: JSON.stringify(['上传', kind === 'video' ? '视频' : '图片']),
          thumb: kind === 'video' ? createThumb(baseName, '#1f5a49', '#ef6c4e', 'video') : publicUrl,
          url: publicUrl,
          review_state: 'pending',
          file_hash: null,
          transfer_state: 'staging',
          original_filename: file.originalname || '',
          created_at: nowIso(),
          updated_at: nowIso(),
          __stagingName: file.filename, // 暂存文件名，传给 transfer
        };
        insertMediaRecord(record);
        stagedRecords.push(record);
        out.push(mediaRowToItem(record));
        logActivity('素材上传', req.user?.username || 'unknown', `上传了 ${record.title}`);
      }
      saveDatabase();
      return out;
    });

    // 全部入库后入队后台传输
    transfer.enqueueTransfer({ jobId, records: stagedRecords });

    res.json({ ok: true, items, jobId });
  },
);

// POST /api/media/:id/review - Review media (approve/reject)
router.post('/:id/review', requireAuth, requirePermission('media:review'), (req, res) => {
  const { transaction, get, run, saveDatabase } = require('../models/database');
  const { mediaRowToItem } = mediaModel;

  const id = String(req.params.id || '');
  const status = String(req.body?.status || '');
  const reviewNote = String(req.body?.reviewNote || '').trim();

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '审核状态不正确。' });
  }

  let updated = null;
  transaction(() => {
    const row = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);
    if (!row) {
      const error = new Error('素材不存在。');
      error.statusCode = 404;
      throw error;
    }

    const nextStatus = status === 'approved' ? '已通过' : '退回';
    const nextNote = reviewNote || row.note;
    run(
      'UPDATE media SET review_state = ?, status = ?, note = ?, updated_at = ? WHERE id = ?',
      [status, nextStatus, nextNote, nowIso(), id],
    );
    saveDatabase();

    updated = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);
    const detail = reviewNote ? `${row.title} 已${nextStatus}（备注：${reviewNote}）` : `${row.title} 已${nextStatus}`;
    logActivity('素材审核', req.user?.username || 'unknown', detail);
  });

  res.json({ ok: true, item: mediaRowToItem(updated) });
});

// DELETE /api/media/:id - Delete media
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const { transaction, get, run, saveDatabase } = require('../models/database');

  const id = String(req.params.id || '');
  const row = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);

  if (!row) {
    return res.status(404).json({ error: '素材不存在。' });
  }

  transaction(() => {
    run('DELETE FROM media WHERE id = ?', [id]);
    logActivity('素材删除', req.user?.username || 'unknown', `${row.title} 已删除`);
    saveDatabase();
  });

  cleanupManagedMediaFile(row, req);
  res.json({ ok: true });
});

// GET /api/media/transfer-states?ids=a,b — 批量查传输态
router.get('/transfer-states', requireAuth, (req, res) => {
  const db = require('../models/database');
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, states: {} });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.all(`SELECT id, transfer_state AS s FROM media WHERE id IN (${placeholders})`, ids);
  const states = {};
  for (const r of rows) states[r.id] = r.s;
  res.json({ ok: true, states });
});

// GET /api/media/folders — 已有 年/活动 文件夹
router.get('/folders', requireAuth, (req, res) => {
  try {
    res.json({ ok: true, folders: mediaModel.listFolders() });
  } catch (error) {
    res.status(500).json({ error: '读取文件夹列表失败。' });
  }
});

// POST /api/media/dedup/scan — 触发哈希计算（全量未哈希）
router.post('/dedup/scan', requireAuth, requirePermission('media:review'), async (req, res) => {
  try {
    const result = await mediaModel.scanHashes(9999);
    res.json({ ok: true, ...result, groups: mediaModel.getDuplicateGroups().length });
  } catch (error) {
    res.status(500).json({ error: '查重扫描失败。' });
  }
});

// GET /api/media/dedup/groups — 重复分组
router.get('/dedup/groups', requireAuth, requirePermission('media:review'), (req, res) => {
  try {
    res.json({ ok: true, groups: mediaModel.getDuplicateGroups(), unhashed: mediaModel.countUnhashed() });
  } catch (error) {
    res.status(500).json({ error: '读取查重结果失败。' });
  }
});

module.exports = router;
