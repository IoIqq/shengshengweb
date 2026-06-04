const fs = require('fs');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 获取当前ISO时间戳
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * 获取本地日期键 (YYYY-MM-DD)
 */
function nowLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化错误对象用于日志
 */
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

/**
 * 序列化日志值
 */
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

module.exports = {
  ensureDir,
  nowIso,
  nowLocalDateKey,
  formatErrorForLog,
  serializeLogValue
};
