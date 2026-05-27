const crypto = require("crypto");
const os = require("os");

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getLanIpAddresses() {
  const seen = new Set();
  const addresses = [];

  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (!info || info.family !== "IPv4" || info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      addresses.push(info.address);
    }
  }

  return addresses.sort((left, right) => left.localeCompare(right));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createThumb(label, colorA, colorB, kind) {
  const icon =
    kind === "video"
      ? `<rect x="23" y="18" width="50" height="36" rx="8" fill="rgba(255,255,255,0.14)"/><polygon points="44,26 44,46 60,36" fill="#fffdf6"/>`
      : `<circle cx="31" cy="26" r="6" fill="#fffdf6"/><path d="M8 58l18-18 12 11 12-14 18 21H8Z" fill="rgba(255,255,255,0.85)"/>`;

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

function normalizePriority(value) {
  if (value === "高" || value === "中" || value === "低") return value;
  return "中";
}

function normalizeReviewState(value) {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  return "pending";
}

function reviewStatusLabel(state) {
  if (state === "approved") return "已通过";
  if (state === "rejected") return "退回";
  return "待审";
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim();
}

function buildSearchClause(columns, term, params) {
  const search = normalizeSearchValue(term);
  if (!search) return "";
  const like = `%${search.toLowerCase()}%`;
  params.push(...columns.map(() => like));
  return `(${columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(" OR ")})`;
}

function parseCookies(header) {
  return header.split(";").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function shouldUseSecureCookie(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.get("x-forwarded-proto") || "").toLowerCase();
  return forwardedProto.split(",")[0].trim() === "https";
}

module.exports = {
  nowIso,
  randomId,
  getLanIpAddresses,
  escapeXml,
  createThumb,
  normalizePriority,
  normalizeReviewState,
  reviewStatusLabel,
  safeParse,
  normalizeSearchValue,
  buildSearchClause,
  parseCookies,
  shouldUseSecureCookie,
};
