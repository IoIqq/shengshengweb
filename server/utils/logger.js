const fs = require('fs');
const path = require('path');
const { nowIso, nowLocalDateKey } = require('./helpers');

let LOG_DIR = null;
let LOG_MAX_BYTES = 5 * 1024 * 1024;
let LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function initLogger(config) {
  LOG_DIR = config.LOG_DIR;
  LOG_MAX_BYTES = config.LOG_MAX_BYTES;
  LOG_RETENTION_MS = config.LOG_RETENTION_MS;
}

function formatErrorForLog(error) {
  if (!error) {
    return { message: 'Unknown error' };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  const payload = {
    name: error.name || 'Error',
    message: error.message || String(error),
  };
  if (error.code !== undefined) payload.code = error.code;
  if (error.errno !== undefined) payload.errno = error.errno;
  if (error.status !== undefined) payload.status = error.status;
  if (error.statusCode !== undefined) payload.statusCode = error.statusCode;
  if (error.stack) payload.stack = error.stack;
  return payload;
}

function serializeLogValue(value) {
  if (value instanceof Error) {
    return formatErrorForLog(value);
  }
  if (Array.isArray(value)) {
    return value.map(serializeLogValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeLogValue(entry)]),
    );
  }
  return value;
}

function rotateLogIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < LOG_MAX_BYTES) return;
    let seq = 1;
    let target;
    do {
      target = filePath.replace(/\.log$/, `-${seq}.log`);
      seq += 1;
    } while (fs.existsSync(target) && seq < 1000);
    fs.renameSync(filePath, target);
  } catch (_) { /* 文件不存在等情况忽略 */ }
}

let logCleanupRan = false;
function cleanupOldLogs() {
  if (logCleanupRan) return;
  logCleanupRan = true;
  fs.readdir(LOG_DIR, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - LOG_RETENTION_MS;
    files.forEach((name) => {
      if (!name.endsWith('.log')) return;
      const full = path.join(LOG_DIR, name);
      fs.stat(full, (statErr, stat) => {
        if (statErr || !stat) return;
        if (stat.mtimeMs < cutoff) {
          fs.unlink(full, () => {});
        }
      });
    });
  });
}

function appendServerLog(level, event, details = {}) {
  const line = JSON.stringify({
    timestamp: nowIso(),
    level,
    event,
    ...serializeLogValue(details),
  });
  const filePath = path.join(LOG_DIR, `${nowLocalDateKey()}.log`);
  rotateLogIfNeeded(filePath);
  fs.appendFile(filePath, `${line}\n`, (error) => {
    if (error) {
      // 写日志的失败不再走日志，避免循环
      console.error('日志写入失败：', error.message || error);
    }
  });
}

function logServerEvent(level, event, details = {}) {
  appendServerLog(level, event, details);
}

function logRequest(req, res, durationMs) {
  logServerEvent('info', 'http_request', {
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs: Number(durationMs.toFixed(2)),
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || 'guest',
  });
}

function logAuthFailure(req, reason, details = {}) {
  logServerEvent('warn', 'auth_failure', {
    reason,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || 'guest',
    ...details,
  });
}

function logLoginFailure(req, username) {
  logServerEvent('warn', 'login_failure', {
    username,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
  });
}

function logUploadIssue(req, error, details = {}) {
  logServerEvent('error', 'upload_error', {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || 'guest',
    error,
    ...details,
  });
}

function logDbIssue(event, error, details = {}) {
  logServerEvent('error', event, {
    error,
    ...details,
  });
}

function logStartupInfo(extra = {}) {
  logServerEvent('info', 'startup', extra);
}

function logProcessFailure(type, error) {
  logServerEvent('fatal', type, {
    error,
    pid: process.pid,
    nodeVersion: process.version,
  });
}

module.exports = {
  initLogger,
  cleanupOldLogs,
  logServerEvent,
  logRequest,
  logAuthFailure,
  logLoginFailure,
  logUploadIssue,
  logDbIssue,
  logStartupInfo,
  logProcessFailure,
};
