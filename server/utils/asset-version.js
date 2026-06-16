/**
 * 自动资产版本号
 *
 * 启动时扫描 public/css、public/js、public/templates 与若干入口文件，
 * 取最大 mtime 与所有相对路径生成稳定哈希，组合成 ASSET_VERSION。
 * 代码改动 → 重启 → 自动换版 → SW CACHE_NAME 与 index.html 的 ?v= 同步。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');

const PUBLIC_DIR = path.join(config.ROOT_DIR, 'public');

const SCAN_DIRS = [
  path.join(PUBLIC_DIR, 'css'),
  path.join(PUBLIC_DIR, 'js'),
  path.join(PUBLIC_DIR, 'templates'),
];

const SCAN_FILES = [
  path.join(PUBLIC_DIR, 'index.html'),
  path.join(PUBLIC_DIR, 'service-worker.js'),
  path.join(PUBLIC_DIR, 'config.js'),
];

const SCAN_EXTS = new Set(['.js', '.css', '.html']);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p, out);
    } else if (ent.isFile() && SCAN_EXTS.has(path.extname(ent.name).toLowerCase())) {
      out.push(p);
    }
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

let cachedVersion = null;

function computeAssetVersion() {
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);
  for (const f of SCAN_FILES) {
    try {
      if (fs.statSync(f).isFile()) files.push(f);
    } catch {}
  }

  let latestMtime = 0;
  const hash = crypto.createHash('sha1');

  files.sort();
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    const mtime = Math.floor(st.mtimeMs);
    if (mtime > latestMtime) latestMtime = mtime;
    hash.update(path.relative(PUBLIC_DIR, f).replace(/\\/g, '/'));
    hash.update('|');
    hash.update(String(mtime));
    hash.update('|');
    hash.update(String(st.size));
    hash.update('\n');
  }

  const stamp = latestMtime
    ? formatDate(new Date(latestMtime))
    : formatDate(new Date());
  const digest = hash.digest('hex').slice(0, 6);
  return `${stamp}-${digest}`;
}

function getAssetVersion() {
  if (!cachedVersion) cachedVersion = computeAssetVersion();
  return cachedVersion;
}

function refreshAssetVersion() {
  cachedVersion = computeAssetVersion();
  return cachedVersion;
}

module.exports = { getAssetVersion, refreshAssetVersion };
