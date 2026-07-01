const { all, get, run, saveDatabase, transaction } = require('./database');
const { nowIso } = require('../utils');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 获取所有媒体
 */
function getAllMedia() {
  return all('SELECT * FROM media ORDER BY created_at DESC');
}

/**
 * 根据ID获取媒体
 */
function getMediaById(id) {
  return get('SELECT * FROM media WHERE id = ?', [id]);
}

/**
 * 创建媒体
 */
function createMedia(data) {
  const now = nowIso();
  const {
    id, kind, title, source, source_type, source_path,
    author, duration, status, note, tags_json,
    thumb, url, review_state
  } = data;

  run(
    `INSERT INTO media (id, kind, title, source, source_type, source_path, author, duration, status, note, tags_json, thumb, url, review_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, kind, title, source, source_type, source_path || null, author, duration, status, note, tags_json, thumb, url, review_state, now, now]
  );
  saveDatabase();

  return getMediaById(id);
}

/**
 * 更新媒体
 */
function updateMedia(id, updates) {
  const now = nowIso();
  const fields = [];
  const values = [];

  const allowedFields = ['title', 'source', 'author', 'duration', 'status', 'note', 'tags_json', 'thumb', 'url', 'review_state'];

  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updates[field]);
    }
  });

  if (fields.length === 0) return getMediaById(id);

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getMediaById(id);
}

/**
 * 删除媒体
 */
function deleteMedia(id) {
  run('DELETE FROM media WHERE id = ?', [id]);
  saveDatabase();
}

/**
 * 搜索媒体
 */
function searchMedia(filters = {}) {
  const { kind, status, review_state, search } = filters;
  let sql = 'SELECT * FROM media WHERE 1=1';
  const params = [];

  if (kind) {
    sql += ' AND kind = ?';
    params.push(kind);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (review_state) {
    sql += ' AND review_state = ?';
    params.push(review_state);
  }
  if (search) {
    sql += ' AND (title LIKE ? OR author LIKE ? OR note LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ' ORDER BY created_at DESC';
  return all(sql, params);
}

/**
 * 转换数据库行为前端对象
 */
function mediaRowToItem(row) {
  const safeParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    source: row.source,
    author: row.author,
    duration: row.duration,
    status: row.status,
    note: row.note,
    tags: safeParse(row.tags_json, []),
    thumb: row.thumb,
    url: row.url,
    reviewState: row.review_state,
    uploadedAt: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileHash: row.file_hash || null,
    transferState: row.transfer_state || 'ready',
    originalFilename: row.original_filename || '',
  };
}

/**
 * 插入媒体记录
 */
function insertMediaRecord(record) {
  run(
    `INSERT INTO media
      (id, kind, title, source, source_type, source_path, author, duration, status, note, tags_json, thumb, url, review_state, file_hash, transfer_state, original_filename, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.kind,
      record.title,
      record.source,
      record.source_type,
      record.source_path,
      record.author,
      record.duration,
      record.status,
      record.note,
      record.tags_json,
      record.thumb,
      record.url,
      record.review_state,
      record.file_hash || null,
      record.transfer_state || 'ready',
      record.original_filename || '',
      record.created_at,
      record.updated_at,
    ],
  );
}

/**
 * 创建缩略图SVG
 */
function createThumb(title, primaryColor, secondaryColor, kind) {
  const label = kind === 'video' ? '视频' : '图片';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="${primaryColor}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${secondaryColor}" font-size="14" font-family="sans-serif">${label}</text></svg>`)}`;
}

/**
 * 生成随机ID
 */
function randomId(prefix) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 记录活动日志
 */
function logActivity(title, meta, detail) {
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomId('act'), title, meta, detail, nowIso()],
  );
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
 * 扫描inbox目录同步媒体
 */
function scanInbox() {
  const INBOX_DIR = config.INBOX_DIR;
  const files = fs.existsSync(INBOX_DIR)
    ? fs
        .readdirSync(INBOX_DIR, { withFileTypes: true })
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
        note: '从服务器 inbox 目录同步而来。',
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
    saveDatabase();
  }

  return { imported: imported.map(mediaRowToItem) };
}

function safeParseTags(raw) {
  try {
    const tags = JSON.parse(raw || '[]');
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
}

function getShowcaseItems(options = {}) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(options.limit, 10) || 50));
  const kindFilter = ['photo', 'video'].includes(options.kindFilter) ? options.kindFilter : '';
  let sql = "SELECT title, kind, thumb, url, author, tags_json, created_at FROM media WHERE review_state = 'approved'";
  const params = [];
  if (kindFilter) {
    sql += ' AND kind = ?';
    params.push(kindFilter);
  }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  params.push(limit);

  const rows = all(sql, params);
  return rows.map((row) => ({
    title: row.title,
    kind: row.kind,
    thumb: row.thumb,
    url: row.url,
    author: row.author,
    tags: safeParseTags(row.tags_json),
    createdAt: row.created_at,
  }));
}

/** 设置传输态 */
function setTransferState(id, state) {
  run('UPDATE media SET transfer_state = ?, updated_at = ? WHERE id = ?', [state, nowIso(), id]);
}

/** 取指定传输态的记录（重启恢复用） */
function getMediaByTransferStates(states) {
  if (!states.length) return [];
  const placeholders = states.map(() => '?').join(',');
  return all(`SELECT * FROM media WHERE transfer_state IN (${placeholders})`, states);
}

/** 写入哈希 */
function setFileHash(id, hash) {
  run('UPDATE media SET file_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), id]);
}

/** 取未计算哈希的记录 */
function getUnhashedMedia(limit = 10) {
  return all('SELECT * FROM media WHERE file_hash IS NULL ORDER BY datetime(created_at) ASC LIMIT ?', [limit]);
}

/** 未哈希计数 */
function countUnhashed() {
  const row = get("SELECT COUNT(*) AS c FROM media WHERE file_hash IS NULL", []);
  return row ? Number(row.c) : 0;
}

/** 由 source_type/source_path 解析出磁盘绝对路径（供哈希/清理用） */
function resolveManagedAbsPath(row) {
  if (!row || !row.source_path) return null;
  const normalized = String(row.source_path).replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(config.UPLOAD_DIR, normalized);
  const rel = path.relative(config.UPLOAD_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

/**
 * 对未哈希记录逐条计算流式哈希并写入。
 * @param {number} limit
 * @returns {Promise<{hashed:number, remaining:number}>}
 */
async function scanHashes(limit = 10) {
  const { computeFileHash } = require('../utils/file-hash');
  const rows = getUnhashedMedia(limit);
  for (const row of rows) {
    try {
      const absPath = resolveManagedAbsPath(row);
      if (!absPath || !fs.existsSync(absPath)) {
        // 文件缺失：写占位哈希避免反复重试，查重时忽略
        setFileHash(row.id, `missing:${row.id}`);
        continue;
      }
      const hash = await computeFileHash(absPath);
      setFileHash(row.id, hash);
    } catch (error) {
      setFileHash(row.id, `error:${error.code || 'failed'}`);
    }
  }
  if (rows.length > 0) saveDatabase();
  return { hashed: rows.length, remaining: countUnhashed() };
}

/** 重复分组：file_hash 相同且非占位的，count>1 */
function getDuplicateGroups() {
  const rows = all(
    `SELECT file_hash AS hash, COUNT(*) AS c
     FROM media
     WHERE file_hash IS NOT NULL
       AND file_hash NOT LIKE 'missing:%' AND file_hash NOT LIKE 'error:%'
     GROUP BY file_hash
     HAVING c > 1
     ORDER BY c DESC`,
  );
  return rows.map((r) => {
    const items = all('SELECT * FROM media WHERE file_hash = ? ORDER BY datetime(created_at) ASC', [r.hash]).map(mediaRowToItem);
    return { hash: r.hash, count: r.c, items };
  });
}

/** 扫描 MEDIA_DIR 下的 年/活动 两层目录，供上传时选择已有文件夹 */
function listFolders() {
  const result = [];
  if (!fs.existsSync(config.MEDIA_DIR)) return result;
  const years = fs.readdirSync(config.MEDIA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => (a < b ? 1 : -1));
  for (const year of years) {
    const yearDir = path.join(config.MEDIA_DIR, year);
    const events = fs.readdirSync(yearDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => (a < b ? 1 : -1));
    result.push({ year, events });
  }
  return result;
}

module.exports = {
  getAllMedia,
  getMediaById,
  createMedia,
  updateMedia,
  deleteMedia,
  searchMedia,
  mediaRowToItem,
  insertMediaRecord,
  scanInbox,
  getShowcaseItems,
  setTransferState,
  getMediaByTransferStates,
  setFileHash,
  getUnhashedMedia,
  countUnhashed,
  scanHashes,
  getDuplicateGroups,
  listFolders,
  resolveManagedAbsPath,
};
