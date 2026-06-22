const fs = require('fs');
const path = require('path');

// 文件夹/文件名非法字符（Windows 为主，兼顾跨平台）
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;

/**
 * 清洗单个路径段：去非法字符、去首尾空白与点号。
 * @param {string} name
 * @returns {string}
 */
function sanitizeSegment(name) {
  if (!name) return '';
  return String(name).replace(ILLEGAL_CHARS, '').trim().replace(/^[.\s]+|[.\s]+$/g, '');
}

/**
 * 把日期（YYYY-MM-DD / YYYY/MM/DD）格式化为 YYYYMMDD。
 * @param {string} date
 * @returns {string}
 */
function compactDate(date) {
  const digits = String(date || '').replace(/\D+/g, '');
  return digits.slice(0, 8);
}

/**
 * 生成活动文件夹名：YYYYMMDD + 活动名（已清洗）。
 */
function buildEventFolderName(date, eventName) {
  return `${compactDate(date)}${sanitizeSegment(eventName)}`;
}

/**
 * 从 YYYYMMDD... 取年。
 */
function yearFromDate(yyyymmdd) {
  return String(yyyymmdd || '').replace(/\D+/g, '').slice(0, 4);
}

/**
 * 生成相对 UPLOAD_DIR 的目标归档路径：media/年/活动/设备
 * @returns {string} 形如 media/2026/20260622物流运动会/Sony A7M4
 */
function buildTargetRelPath({ date, eventName, deviceName }) {
  const eventFolder = buildEventFolderName(date, eventName);
  const year = yearFromDate(eventFolder);
  const device = sanitizeSegment(deviceName);
  return path.posix.join('media', year, eventFolder, device);
}

/**
 * 判断绝对路径是否为 UNC（网络）路径。
 */
function isUncPath(absPath) {
  const p = String(absPath || '').trim();
  return p.startsWith('\\\\') || p.startsWith('//');
}

/**
 * 在 dir 内为 basename 解决重名：不存在则原名，否则追加 (1)/(2)…。
 * @returns {string} 仅文件名（不含目录）。
 */
function resolveCollidingFilename(dir, basename) {
  if (!fs.existsSync(path.join(dir, basename))) return basename;
  const ext = path.extname(basename);
  const stem = path.basename(basename, ext);
  for (let i = 1; i < 100000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  // 兜底
  return `${stem}-${Date.now()}${ext}`;
}

module.exports = {
  sanitizeSegment,
  compactDate,
  buildEventFolderName,
  yearFromDate,
  buildTargetRelPath,
  isUncPath,
  resolveCollidingFilename,
};
