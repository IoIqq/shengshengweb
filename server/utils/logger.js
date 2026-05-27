const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(LOG_DIR);

function nowIso() {
  return new Date().toISOString();
}

function nowLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatErrorForLog(error) {
  if (!error) {
    return { message: "Unknown error" };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  const payload = {
    name: error.name || "Error",
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
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeLogValue(entry)]),
    );
  }
  return value;
}

function appendServerLog(level, event, details = {}) {
  const line = JSON.stringify({
    timestamp: nowIso(),
    level,
    event,
    ...serializeLogValue(details),
  });
  const filePath = path.join(LOG_DIR, `${nowLocalDateKey()}.log`);
  try {
    fs.appendFileSync(filePath, `${line}\n`);
  } catch (error) {
    console.error("日志写入失败：", error);
  }
}

function logServerEvent(level, event, details = {}) {
  appendServerLog(level, event, details);
}

function logRequest(req, res, durationMs) {
  logServerEvent("info", "http_request", {
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs: Number(durationMs.toFixed(2)),
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
  });
}

function logAuthFailure(req, reason, details = {}) {
  logServerEvent("warn", "auth_failure", {
    reason,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
    ...details,
  });
}

function logLoginFailure(req, username) {
  logServerEvent("warn", "login_failure", {
    username,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
  });
}

function logUploadIssue(req, error, details = {}) {
  logServerEvent("error", "upload_error", {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    role: req.user?.role || req.session?.user?.role || "guest",
    error,
    ...details,
  });
}

function logDbIssue(event, error, details = {}) {
  logServerEvent("error", event, {
    error,
    ...details,
  });
}

function logStartupInfo(extra = {}) {
  logServerEvent("info", "startup", {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    nodeEnv: process.env.NODE_ENV || "development",
    ...extra,
  });
}

function logProcessFailure(type, error) {
  logServerEvent("fatal", type, {
    error,
    pid: process.pid,
    nodeVersion: process.version,
  });
}

module.exports = {
  logServerEvent,
  logRequest,
  logAuthFailure,
  logLoginFailure,
  logUploadIssue,
  logDbIssue,
  logStartupInfo,
  logProcessFailure,
};
