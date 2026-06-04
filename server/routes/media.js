const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { media: mediaModel } = require('../models');
const { requireAuth, requireEditor, requireAdmin } = require('../middleware/auth');
const config = require('../config');
const { nowIso } = require('../utils');

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

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.MEDIA_DIR);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      cb(null, `upload-${timestamp}-${random}${ext}`);
    },
  }),
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    files: config.MAX_UPLOAD_FILES,
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

function buildUploadedMedia(file, overrides = {}) {
  const kind = file.mimetype.startsWith('video/') ? 'video' : 'photo';
  const publicUrl = `/uploads/media/${file.filename}`;
  const title = overrides.title || file.originalname.replace(/\.[^.]+$/, '');
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  return {
    id: `media-${timestamp}-${random}`,
    kind,
    title,
    source: overrides.source || `本地上传 / ${file.originalname}`,
    source_type: 'upload',
    source_path: path.join('media', file.filename).replace(/\\/g, '/'),
    author: overrides.author || '工作台',
    duration: kind === 'video' ? '本地视频' : '本地图片',
    status: '待审',
    note: overrides.note || '由浏览器上传到本地素材库。',
    tags_json: JSON.stringify(overrides.tags || ['上传', kind === 'video' ? '视频' : '图片']),
    thumb: kind === 'video' ? createThumb(title, '#1f5a49', '#ef6c4e', 'video') : publicUrl,
    url: publicUrl,
    review_state: 'pending',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
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

// POST /api/media/upload - Upload media files
router.post('/upload', uploadLimiter, requireAuth, requireEditor, (req, res, next) => {
  mediaUpload.array('files', config.MAX_UPLOAD_FILES)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `文件大小超过${config.MAX_UPLOAD_MB}MB限制。` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ error: `一次最多上传${config.MAX_UPLOAD_FILES}个文件。` });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '上传字段名不正确，请使用"files"字段。' });
      }
      if (err.statusCode === 400) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: '文件上传失败，请重试。' });
    }

    const { transaction } = require('../models/database');
    const { insertMediaRecord, mediaRowToItem } = mediaModel;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: '请先选择要上传的文件。' });
    }

    const items = [];
    transaction(() => {
      for (const file of files) {
        const record = buildUploadedMedia(file, {
          author: req.user?.username || '工作台',
        });
        insertMediaRecord(record);
        items.push(mediaRowToItem(record));
        logActivity('素材上传', req.user?.username || 'unknown', `上传了 ${record.title}`);
      }
    });

    res.json({ ok: true, items });
  });
});

// POST /api/media/:id/review - Review media (approve/reject)
router.post('/:id/review', requireAuth, requireEditor, (req, res) => {
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
  const { transaction, get, run } = require('../models/database');

  const id = String(req.params.id || '');
  const row = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);

  if (!row) {
    return res.status(404).json({ error: '素材不存在。' });
  }

  transaction(() => {
    run('DELETE FROM media WHERE id = ?', [id]);
    logActivity('素材删除', req.user?.username || 'unknown', `${row.title} 已删除`);
  });

  cleanupManagedMediaFile(row, req);
  res.json({ ok: true });
});

module.exports = router;
