const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const config = require('../config');
const { ensureDir } = require('../utils');

const router = express.Router();
const MAX_COUNT_FILES = 5000;
const MAX_COUNT_DEPTH = 3;
const STATUS_CACHE_TTL_MS = 8000;
let statusCache = null;
let statusCacheAt = 0;

function clearStatusCache() {
  statusCache = null;
  statusCacheAt = 0;
}

function toDisplayPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeCandidate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return config.resolvePath(raw, '');
}

function comparePath(value) {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function getRoot(value) {
  const resolved = path.resolve(value);
  return path.parse(resolved).root || resolved;
}

function isRootPath(value) {
  return comparePath(value) === comparePath(getRoot(value));
}

function isInsidePath(child, parent) {
  const relativePath = path.relative(parent, child);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isDangerousPath(value) {
  const normalized = comparePath(value);
  const projectRoot = comparePath(config.ROOT_DIR);
  const userHome = os.homedir() ? comparePath(os.homedir()) : '';
  const databaseDir = comparePath(path.dirname(config.DB_PATH));
  if (normalized === projectRoot || normalized === userHome || normalized === databaseDir) return true;
  if (process.platform === 'win32') {
    return [
      'c:\\windows',
      'c:\\program files',
      'c:\\program files (x86)',
    ].some((dangerous) => normalized === dangerous || normalized.startsWith(`${dangerous}\\`));
  }
  return ['/etc', '/bin', '/sbin', '/usr', '/var', '/lib', '/lib64'].some(
    (dangerous) => normalized === dangerous || normalized.startsWith(`${dangerous}/`)
  );
}

function getExistingAncestor(targetPath) {
  let current = targetPath;
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(current)) return current;
    current = path.dirname(current);
  }
  return fs.existsSync(current) ? current : '';
}

function checkWritable(targetPath) {
  const existingPath = fs.existsSync(targetPath) ? targetPath : getExistingAncestor(path.dirname(targetPath));
  if (!existingPath) {
    return { ok: false, checkedPath: '', reason: '找不到可检查的父目录。' };
  }
  try {
    fs.accessSync(existingPath, fs.constants.W_OK);
    return { ok: true, checkedPath: toDisplayPath(existingPath) };
  } catch (error) {
    return { ok: false, checkedPath: toDisplayPath(existingPath), reason: '目录不可写。' };
  }
}

function getPathHealth(targetPath, type = 'directory') {
  const health = {
    path: toDisplayPath(targetPath),
    exists: false,
    isDirectory: false,
    readable: false,
    writable: false,
    sizeBytes: 0,
    ok: false,
  };

  try {
    const stat = fs.statSync(targetPath);
    health.exists = true;
    health.isDirectory = stat.isDirectory();
    health.sizeBytes = stat.isFile() ? stat.size : 0;
    fs.accessSync(targetPath, fs.constants.R_OK);
    health.readable = true;
    fs.accessSync(targetPath, fs.constants.W_OK);
    health.writable = true;
    health.ok = type === 'file' ? stat.isFile() && health.readable : stat.isDirectory() && health.readable && health.writable;
  } catch (error) {
    health.error = error.code || error.message;
  }

  return health;
}

function getDatabaseHealth() {
  const fileHealth = getPathHealth(config.DB_PATH, 'file');
  const parentHealth = getPathHealth(path.dirname(config.DB_PATH));
  return {
    path: toDisplayPath(config.DB_PATH),
    exists: fileHealth.exists,
    sizeBytes: fileHealth.sizeBytes,
    parent: parentHealth,
    ok: parentHealth.isDirectory && parentHealth.writable,
  };
}

function countFilesInDirectory(rootDir) {
  const summary = { files: 0, directories: 0, sizeBytes: 0, truncated: false };
  if (!fs.existsSync(rootDir)) return summary;

  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || current.depth > MAX_COUNT_DEPTH || summary.files >= MAX_COUNT_FILES) {
      summary.truncated = true;
      continue;
    }

    let entries;
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch (error) {
      summary.truncated = true;
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        summary.directories += 1;
        stack.push({ dir: fullPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(fullPath);
        summary.files += 1;
        summary.sizeBytes += stat.size;
      } catch (error) {
        summary.truncated = true;
      }
      if (summary.files >= MAX_COUNT_FILES) {
        summary.truncated = true;
        break;
      }
    }
  }

  return summary;
}

function getVolumeStats(root) {
  const volume = {
    root: toDisplayPath(root),
    exists: fs.existsSync(root),
    totalBytes: null,
    freeBytes: null,
    usedBytes: null,
    usedPercent: null,
    capacityAvailable: false,
    isCurrentStorage: comparePath(getRoot(config.UPLOAD_DIR)) === comparePath(root),
  };

  if (!volume.exists || typeof fs.statfsSync !== 'function') return volume;

  try {
    const stats = fs.statfsSync(root);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const totalBytes = Number(stats.blocks || 0) * blockSize;
    const freeBytes = Number(stats.bavail || stats.bfree || 0) * blockSize;
    if (totalBytes > 0) {
      volume.totalBytes = totalBytes;
      volume.freeBytes = freeBytes;
      volume.usedBytes = Math.max(0, totalBytes - freeBytes);
      volume.usedPercent = Math.round((volume.usedBytes / totalBytes) * 1000) / 10;
      volume.capacityAvailable = true;
    }
  } catch (error) {
    volume.error = error.code || error.message;
  }

  return volume;
}

function getVolumes() {
  const roots = new Set([
    getRoot(config.UPLOAD_DIR),
    getRoot(config.INBOX_DIR),
    getRoot(config.DB_PATH),
  ]);

  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:/`;
      if (fs.existsSync(root)) roots.add(root);
    }
  } else {
    ['/', '/mnt', '/media'].forEach((root) => {
      if (fs.existsSync(root)) roots.add(root);
    });
  }

  return Array.from(roots).map(getVolumeStats).sort((a, b) => a.root.localeCompare(b.root));
}

function isPrivateIPv4(address) {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
    || /^169\.254\./.test(address);
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const url = `http://${entry.address}:${config.PORT}`;
      addresses.push({ name, address: entry.address, url, private: isPrivateIPv4(entry.address) });
    }
  }
  return addresses.sort((a, b) => Number(b.private) - Number(a.private));
}

function buildEnvSnippet(uploadDir, inboxDir) {
  return `UPLOAD_DIR=${toDisplayPath(uploadDir)}\nINBOX_DIR=${toDisplayPath(inboxDir)}`;
}

function validateStoragePaths(body) {
  const errors = [];
  const uploadDir = normalizeCandidate(body.uploadDir);
  const inboxDir = normalizeCandidate(body.inboxDir || (uploadDir ? path.join(uploadDir, 'inbox') : ''));

  if (!uploadDir) errors.push({ field: 'uploadDir', message: '请填写素材存储根目录。' });
  if (!inboxDir) errors.push({ field: 'inboxDir', message: '请填写或生成 inbox 目录。' });

  if (uploadDir) {
    if (isRootPath(uploadDir)) errors.push({ field: 'uploadDir', message: '素材根目录不能直接使用磁盘根目录。' });
    if (isDangerousPath(uploadDir)) errors.push({ field: 'uploadDir', message: '素材根目录不能指向系统目录。' });
    const writable = checkWritable(uploadDir);
    if (!writable.ok) errors.push({ field: 'uploadDir', message: writable.reason || '素材根目录不可写。' });
  }

  if (inboxDir) {
    if (isRootPath(inboxDir)) errors.push({ field: 'inboxDir', message: 'Inbox 目录不能直接使用磁盘根目录。' });
    if (isDangerousPath(inboxDir)) errors.push({ field: 'inboxDir', message: 'Inbox 目录不能指向系统目录。' });
    if (uploadDir && !isInsidePath(inboxDir, uploadDir)) {
      errors.push({ field: 'inboxDir', message: '建议将 inbox 放在素材根目录内，例如 uploads/inbox。' });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    paths: {
      uploadDir: toDisplayPath(uploadDir),
      mediaDir: toDisplayPath(path.join(uploadDir || '', 'media')),
      inboxDir: toDisplayPath(inboxDir),
      avatarDir: toDisplayPath(path.join(uploadDir || '', 'avatars')),
      deviceImageDir: toDisplayPath(path.join(uploadDir || '', 'devices')),
    },
    envSnippet: uploadDir && inboxDir ? buildEnvSnippet(uploadDir, inboxDir) : '',
  };
}

function getConfigSource() {
  if (config.UPLOAD_DIR_SOURCE === 'env' || config.INBOX_DIR_SOURCE === 'env') return 'env';
  if (config.UPLOAD_DIR_SOURCE === 'storage-config' || config.INBOX_DIR_SOURCE === 'storage-config') return 'storage-config';
  return 'default';
}

function savedPath(key) {
  const value = typeof config.STORAGE_CONFIG[key] === 'string' ? config.STORAGE_CONFIG[key].trim() : '';
  return value ? toDisplayPath(config.resolvePath(value, '')) : '';
}

function activeConfig() {
  return {
    source: getConfigSource(),
    uploadDir: toDisplayPath(config.UPLOAD_DIR),
    mediaDir: toDisplayPath(config.MEDIA_DIR),
    inboxDir: toDisplayPath(config.INBOX_DIR),
    avatarDir: toDisplayPath(config.AVATAR_DIR),
    deviceImageDir: toDisplayPath(config.DEVICE_IMAGE_DIR),
  };
}

function savedConfig() {
  const uploadDir = savedPath('uploadDir');
  const inboxDir = savedPath('inboxDir');
  return {
    uploadDir,
    mediaDir: uploadDir ? toDisplayPath(path.join(uploadDir, 'media')) : '',
    inboxDir,
    avatarDir: uploadDir ? toDisplayPath(path.join(uploadDir, 'avatars')) : '',
    deviceImageDir: uploadDir ? toDisplayPath(path.join(uploadDir, 'devices')) : '',
  };
}

function hasPendingSavedConfig() {
  const saved = savedConfig();
  if (!saved.uploadDir && !saved.inboxDir) return false;
  return comparePath(saved.uploadDir || config.UPLOAD_DIR) !== comparePath(config.UPLOAD_DIR)
    || comparePath(saved.inboxDir || config.INBOX_DIR) !== comparePath(config.INBOX_DIR);
}

function buildStatus() {
  const active = activeConfig();
  const saved = savedConfig();
  return {
    config: {
      ...active,
      savedConfig: saved,
      activeConfig: active,
      restartRequired: hasPendingSavedConfig(),
      storageDirStatus: Array.isArray(config.STORAGE_DIR_STATUS) ? config.STORAGE_DIR_STATUS.map((item) => ({
        ...item,
        path: toDisplayPath(item.path),
      })) : [],
      envOverrides: {
        uploadDir: config.UPLOAD_DIR_SOURCE === 'env',
        inboxDir: config.INBOX_DIR_SOURCE === 'env',
      },
    },
    health: {
      uploadDir: getPathHealth(config.UPLOAD_DIR),
      mediaDir: getPathHealth(config.MEDIA_DIR),
      inboxDir: getPathHealth(config.INBOX_DIR),
      avatarDir: getPathHealth(config.AVATAR_DIR),
      deviceImageDir: getPathHealth(config.DEVICE_IMAGE_DIR),
      database: getDatabaseHealth(),
    },
    usage: countFilesInDirectory(config.UPLOAD_DIR),
    volumes: getVolumes(),
    lan: getLanAddresses(),
  };
}

router.get('/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const forceRefresh = String(req.query.refresh || '') === '1';
    const now = Date.now();
    if (!forceRefresh && statusCache && now - statusCacheAt < STATUS_CACHE_TTL_MS) {
      return res.json(statusCache);
    }
    statusCache = buildStatus();
    statusCacheAt = now;
    res.json(statusCache);
  } catch (error) {
    res.status(500).json({ error: '读取存储状态失败。' });
  }
});

router.post('/validate', requireAuth, requireAdmin, (req, res) => {
  const result = validateStoragePaths(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/config', requireAuth, requireAdmin, (req, res) => {
  const result = validateStoragePaths(req.body || {});
  if (!result.ok) return res.status(400).json(result);

  try {
    ensureDir(path.dirname(config.STORAGE_CONFIG_PATH));
    const payload = {
      uploadDir: result.paths.uploadDir,
      inboxDir: result.paths.inboxDir,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(config.STORAGE_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');
    clearStatusCache();

    const envOverride = config.UPLOAD_DIR_SOURCE === 'env' || config.INBOX_DIR_SOURCE === 'env';
    res.json({
      ok: true,
      config: payload,
      activeConfig: activeConfig(),
      savedConfig: {
        uploadDir: payload.uploadDir,
        mediaDir: toDisplayPath(path.join(payload.uploadDir, 'media')),
        inboxDir: payload.inboxDir,
        avatarDir: toDisplayPath(path.join(payload.uploadDir, 'avatars')),
        deviceImageDir: toDisplayPath(path.join(payload.uploadDir, 'devices')),
      },
      validation: result,
      restartRequired: true,
      effectiveAfterRestart: !envOverride,
      reason: envOverride ? '当前 .env 环境变量优先级更高，请修改 .env 或移除对应变量。' : '',
    });
  } catch (error) {
    res.status(500).json({ error: '保存存储配置失败。' });
  }
});

module.exports = router;
