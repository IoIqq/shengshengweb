const fs = require('fs');
const path = require('path');
const { all, get, runWrite, transaction, persistDb } = require('../database');
const { setSetting, insertMediaRecord } = require('../database/seed');
const { nowIso, randomId, createThumb } = require('../utils/helpers');
const { logServerEvent } = require('../utils/logger');
const { mediaRowToItem } = require('./common');
const config = require('../config');

// 辅助函数
function logActivity(title, meta, detail) {
  runWrite(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomId('act'), title, meta, detail, nowIso()],
  );
}

// 检查是否为媒体文件
function isMediaFile(file) {
  if (!file || !file.mimetype) return false;
  const mimeOk = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  if (!mimeOk) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  return config.ALLOWED_MEDIA_EXTS.has(ext);
}

// 构建上传的媒体对象
function buildUploadedMedia(file, overrides = {}) {
  const kind = file.mimetype.startsWith('video/') ? 'video' : 'photo';
  const publicUrl = `/uploads/media/${file.filename}`;
  const title = overrides.title || file.originalname.replace(/\.[^.]+$/, '');

  // 生成更友好的简介
  const fileSize = file.size ? `${(file.size / 1024 / 1024).toFixed(2)}MB` : '未知大小';
  const uploadTime = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const defaultNote = kind === 'video'
    ? `视频素材，文件大小 ${fileSize}，上传于 ${uploadTime}。等待审核通过后可用于内容制作。`
    : `图片素材，文件大小 ${fileSize}，上传于 ${uploadTime}。等待审核通过后可用于内容制作。`;

  return {
    id: randomId('media'),
    kind,
    title,
    source: overrides.source || `本地上传 / ${file.originalname}`,
    source_type: 'upload',
    source_path: path.join('media', file.filename).replace(/\\/g, '/'),
    author: overrides.author || '工作台',
    duration: kind === 'video' ? '本地视频' : '本地图片',
    status: '待审',
    note: overrides.note || defaultNote,
    tags_json: JSON.stringify(overrides.tags || ['上传', kind === 'video' ? '视频' : '图片']),
    thumb: kind === 'video' ? createThumb(title, '#1f5a49', '#ef6c4e', 'video') : publicUrl,
    url: publicUrl,
    review_state: 'pending',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

// 管理的媒体源类型
const MANAGED_MEDIA_SOURCE_TYPES = new Set(['upload', 'inbox']);

// 解析管理的媒体路径
function resolveManagedMediaPath(sourceType, sourcePath) {
  if (!sourcePath) return null;
  const normalizedPath = String(sourcePath).replace(/\\/g, '/').replace(/^\/+/, '');
  const baseDir = sourceType === 'upload' ? config.MEDIA_DIR : sourceType === 'inbox' ? config.INBOX_DIR : null;
  if (!baseDir) {
    return null;
  }
  const resolvedPath = path.resolve(config.UPLOAD_DIR, normalizedPath);
  const relativePath = path.relative(baseDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return resolvedPath;
}

// 清理管理的媒体文件
function cleanupManagedMediaFile(row, req) {
  if (!row) return { skipped: true, reason: 'missing_row' };
  const sourceType = String(row.source_type || '').toLowerCase();
  if (!MANAGED_MEDIA_SOURCE_TYPES.has(sourceType)) {
    return { skipped: true, reason: 'non_local_source' };
  }

  const targetPath = resolveManagedMediaPath(sourceType, row.source_path);
  if (!targetPath) {
    logServerEvent('warn', 'media_delete_skipped_unsafe_path', {
      mediaId: row.id,
      sourceType,
      sourcePath: row.source_path,
      user: req.user?.username || 'unknown',
    });
    return { skipped: true, reason: 'unsafe_path' };
  }

  try {
    fs.unlinkSync(targetPath);
    return { deleted: true, targetPath };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      logServerEvent('warn', 'media_delete_file_cleanup_failed', {
        mediaId: row.id,
        sourceType,
        sourcePath: row.source_path,
        targetPath,
        user: req.user?.username || 'unknown',
        error,
      });
    }
    return { skipped: true, reason: error?.code || 'unlink_failed', targetPath };
  }
}

// 扫描 inbox 目录
function scanInbox() {
  const files = fs.existsSync(config.INBOX_DIR)
    ? fs
      .readdirSync(config.INBOX_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
    : [];

  const existing = new Set(
    all("SELECT source_path FROM media WHERE source_type = 'inbox' AND source_path IS NOT NULL").map((row) => row.source_path),
  );
  const imported = [];

  transaction(() => {
    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
      if (!isVideo && !isImage) continue;

      const sourcePath = `inbox/${name}`;
      if (existing.has(sourcePath)) continue;

      const fileUrl = `/uploads/inbox/${encodeURIComponent(name)}`;
      const title = name.replace(/\.[^.]+$/, '');
      const syncTime = new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const syncNote = isVideo
        ? `服务器视频素材，同步于 ${syncTime}。来自服务器 inbox 目录，等待审核后可使用。`
        : `服务器图片素材，同步于 ${syncTime}。来自服务器 inbox 目录，等待审核后可使用。`;

      const record = {
        id: randomId('media'),
        kind: isVideo ? 'video' : 'photo',
        title,
        source: `服务器同步 / ${name}`,
        source_type: 'inbox',
        source_path: sourcePath,
        author: '服务器照片',
        duration: isVideo ? '同步视频' : '同步图片',
        status: '待审',
        note: syncNote,
        tags_json: JSON.stringify(['服务器', '同步', isVideo ? '视频' : '图片']),
        thumb: isVideo ? createThumb(title, '#163d32', '#ef6c4e', 'video') : fileUrl,
        url: fileUrl,
        review_state: 'pending',
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      insertMediaRecord(record);
      imported.push(record);
    }

    if (imported.length) {
      setSetting('syncMessage', `已同步 ${imported.length} 个服务器素材`);
      setSetting('lastSyncAt', nowIso());
      logActivity('服务器照片同步', `新增 ${imported.length} 条`, '已从 inbox 目录导入到素材库。');
    }
  });

  if (imported.length) {
    persistDb();
  }

  return { imported: imported.map(mediaRowToItem) };
}

module.exports = {
  isMediaFile,
  buildUploadedMedia,
  resolveManagedMediaPath,
  cleanupManagedMediaFile,
  scanInbox,
  logActivity,
};
