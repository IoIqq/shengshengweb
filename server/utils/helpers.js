const crypto = require('crypto');
const fs = require('fs');

function nowIso() {
  return new Date().toISOString();
}

function nowLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createThumb(label, colorA, colorB, kind) {
  const icon =
    kind === 'video'
      ? '<rect x="23" y="18" width="50" height="36" rx="8" fill="rgba(255,255,255,0.14)"/><polygon points="44,26 44,46 60,36" fill="#fffdf6"/>'
      : '<circle cx="31" cy="26" r="6" fill="#fffdf6"/><path d="M8 58l18-18 12 11 12-14 18 21H8Z" fill="rgba(255,255,255,0.85)"/>';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorA}" />
          <stop offset="100%" stop-color="${colorB}" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="28" fill="url(#g)" />
      <g opacity="0.18" fill="#fffdf6">
        <circle cx="270" cy="58" r="54" />
        <circle cx="70" cy="165" r="42" />
      </g>
      ${icon}
      <text x="26" y="166" fill="#fffdf6" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="22" font-weight="700">${escapeXml(
    label,
  )}</text>
      <text x="26" y="186" fill="rgba(255,255,255,0.82)" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="12">声声网络思政工作室</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function countFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = require('path').join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFilesRecursively(full);
    } else {
      total += 1;
    }
  }
  return total;
}

module.exports = {
  nowIso,
  nowLocalDateKey,
  randomId,
  escapeXml,
  createThumb,
  ensureDir,
  safeParse,
  countFilesRecursively,
};
