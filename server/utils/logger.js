const fs = require('fs');
const path = require('path');
const config = require('../config');
const { nowIso, nowLocalDateKey, serializeLogValue } = require('./index');

let logCleanupRan = false;

/**
 * 日志轮转（当文件超过阈值时）
 */
function rotateLogIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < config.LOG_MAX_BYTES) return;
    let seq = 1;
    let target;
    do {
      target = filePath.replace(/\.log$/, `-${seq}.log`);
      seq += 1;
    } while (fs.existsSync(target) && seq < 1000);
    fs.renameSync(filePath, target);
  } catch (_) { /* 文件不存在等情况忽略 */ }
}

/**
 * 清理过期日志
 */
function cleanupOldLogs() {
  if (logCleanupRan) return;
  logCleanupRan = true;
  fs.readdir(config.LOG_DIR, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - config.LOG_RETENTION_MS;
    files.forEach((name) => {
      if (!name.endsWith('.log')) return;
      const full = path.join(config.LOG_DIR, name);
      fs.stat(full, (statErr, stat) => {
        if (statErr || !stat) return;
        if (stat.mtimeMs < cutoff) {
          fs.unlink(full, () => {});
        }
      });
    });
  });
}

/**
 * 写入日志到文件
 */
function appendServerLog(level, event, details = {}) {
  const line = JSON.stringify({
    timestamp: nowIso(),
    level,
    event,
    ...serializeLogValue(details),
  });
  const filePath = path.join(config.LOG_DIR, `${nowLocalDateKey()}.log`);
  rotateLogIfNeeded(filePath);
  fs.appendFile(filePath, `${line}\n`, (error) => {
    if (error) {
      console.error('日志写入失败：', error.message || error);
    }
  });
}

/**
 * 记录服务器事件
 */
function logServerEvent(level, event, details = {}) {
  appendServerLog(level, event, details);
}

/**
 * 记录HTTP请求
 */
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

/**
 * 记录登录失败
 */
function logLoginFailure(req, username) {
  logServerEvent('warn', 'login_failure', {
    username,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
}

/**
 * 记录认证失败（权限不足等）
 */
function logAuthFailure(req, reason, extra = {}) {
  logServerEvent('warn', 'auth_failure', {
    reason,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || 'guest',
    ...extra,
  });
}

/**
 * 记录数据库问题
 */
function logDbIssue(context, error) {
  logServerEvent('error', 'db_issue', {
    context,
    message: error?.message || String(error),
  });
}

module.exports = {
  cleanupOldLogs,
  logServerEvent,
  logRequest,
  logLoginFailure,
  logAuthFailure,
  logDbIssue,
};
