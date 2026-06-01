const express = require('express');
const multer = require('multer');
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction } = require('../database');
const { insertMediaRecord } = require('../database/seed');

// 导入中间件
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

// 导入工具函数
const { nowIso, randomId } = require('../utils/helpers');
const { logUploadIssue } = require('../utils/logger');

// 导入服务
const {
  isMediaFile,
  buildUploadedMedia,
  cleanupManagedMediaFile,
  scanInbox,
  logActivity
} = require('../services/media');
const { mediaRowToItem } = require('../services/common');

// 导入配置
const config = require('../config');

// 媒体上传配置
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.MEDIA_DIR);
    },
    filename(req, file, cb) {
      const ext = require('path').extname(file.originalname || '').toLowerCase();
      cb(null, `${randomId('upload')}${ext}`);
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
    const error = new Error('仅支持图片或视频文件。');
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    cb(error);
  },
});

// ========== 媒体路由 ==========

// 同步服务器素材
router.post('/media/sync', requireAuth, (req, res) => {
  try {
    const result = scanInbox();
    res.json({ ok: true, imported: result.imported.length, items: result.imported });
  } catch (error) {
    logUploadIssue(req, error, { reason: 'sync_failed' });
    res.status(500).json({ error: '素材同步失败。' });
  }
});

// 上传媒体文件
router.post('/media/upload', uploadLimiter, requireAuth, mediaUpload.array('files', config.MAX_UPLOAD_FILES), (req, res) => {
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

// 审核媒体
router.post('/media/:id/review', requireAuth, (req, res) => {
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
    runWrite(
      'UPDATE media SET review_state = ?, status = ?, note = ?, updated_at = ? WHERE id = ?',
      [status, nextStatus, nextNote, nowIso(), id],
    );
    updated = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);
    const detail = reviewNote ? `${row.title} 已${nextStatus}（备注：${reviewNote}）` : `${row.title} 已${nextStatus}`;
    logActivity('素材审核', req.user?.username || 'unknown', detail);
  });

  res.json({ ok: true, item: mediaRowToItem(updated) });
});

// 删除媒体
router.delete('/media/:id', requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const row = get('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);
  if (!row) {
    return res.status(404).json({ error: '素材不存在或已被删除。' });
  }

  transaction(() => {
    runWrite('DELETE FROM media WHERE id = ?', [id]);
    logActivity('素材删除', req.user?.username || 'unknown', `${row.title} 已删除`);
  });

  const cleanupResult = cleanupManagedMediaFile(row, req);
  res.json({
    ok: true,
    message: '素材已成功删除。',
    item: { id: row.id, title: row.title },
    fileDeleted: cleanupResult.deleted || false
  });
});

module.exports = router;
