const initSqlJs = require('sql.js');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const config = require('../config');
const { logDbIssue } = require('../utils/logger');

let db = null;
let transactionDepth = 0;
let pendingSave = false;
let flushTimer = null;
let activeFlush = null;
const FLUSH_INTERVAL_MS = 200;

// ============================================================
// 内部工具
// ============================================================

/** 确保数据库已初始化，否则抛出明确错误 */
function requireDb() {
  if (!db) throw new Error('Database not initialized');
}

/** 原子写入：先写 .tmp 再 rename，避免写一半崩溃损坏主文件 */
function writeAtomicallySync(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);
}

async function writeAtomically(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(tmpPath, data);
  await fsp.rename(tmpPath, filePath);
}

/** 确保表中存在某列，不存在则 ALTER TABLE ADD COLUMN */
function ensureColumn(table, column, definition) {
  const columns = all(`PRAGMA table_info(${table})`).map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** 确保索引存在 */
function ensureIndex(table, columns) {
  const name = `idx_${table}_${columns.join('_')}`;
  db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns.join(', ')})`);
}

/**
 * 初始化数据库连接
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(config.DB_PATH)) {
    const buffer = fs.readFileSync(config.DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  return db;
}

/**
 * 创建数据表
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS team (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      note TEXT NOT NULL,
      badge TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_path TEXT,
      author TEXT NOT NULL,
      duration TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      thumb TEXT NOT NULL,
      url TEXT NOT NULL,
      review_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      priority TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      assignee_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      meta TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      asset_no TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      model TEXT,
      purchase_date TEXT,
      image TEXT,
      location TEXT,
      owner TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS borrow_requests (
      id TEXT PRIMARY KEY,
      applicant TEXT NOT NULL,
      device_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      borrow_at TEXT NOT NULL,
      expected_return_at TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL,
      return_status TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      returned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      mood TEXT,
      anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topic_library (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_host TEXT DEFAULT '',
      source_platform TEXT DEFAULT 'other',
      embed_url TEXT DEFAULT '',
      thumbnail_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'idea',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registration_requests (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      contact TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      reject_reason TEXT,
      created_user_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `);

  migrateSchema();
}

/**
 * 数据库架构迁移 — 声明式增量更新
 * 格式：[表名, 列名, SQL 类型定义]
 */
const SCHEMA_MIGRATIONS = [
  // team 扩展
  ['team', 'email', "TEXT DEFAULT ''"],
  ['team', 'phone', "TEXT DEFAULT ''"],
  ['team', 'status', "TEXT DEFAULT 'active'"],
  ['team', 'joined_at', "TEXT DEFAULT ''"],
  ['team', 'student_id', "TEXT DEFAULT ''"],
  ['team', 'grade', "TEXT DEFAULT ''"],
  ['team', 'major', "TEXT DEFAULT ''"],
  ['team', 'skills', "TEXT DEFAULT ''"],
  ['team', 'bio', "TEXT DEFAULT ''"],
  ['team', 'groups', "TEXT DEFAULT ''"],
  ['team', 'party_join_at', "TEXT DEFAULT ''"],
  // devices 扩展
  ['devices', 'model', "TEXT DEFAULT ''"],
  ['devices', 'purchase_date', "TEXT DEFAULT ''"],
  ['devices', 'image', "TEXT DEFAULT ''"],
  ['devices', 'serial_no', "TEXT DEFAULT ''"],
  ['devices', 'warranty_until', "TEXT DEFAULT ''"],
  ['devices', 'price', 'REAL DEFAULT 0'],
  // users 扩展
  ['users', 'display_name', "TEXT DEFAULT ''"],
  ['users', 'signature', "TEXT DEFAULT ''"],
  ['users', 'avatar_url', "TEXT DEFAULT ''"],
  ['users', 'status', "TEXT DEFAULT 'active'"],
  ['users', 'last_login_at', 'TEXT DEFAULT NULL'],
  ['users', 'created_by', 'INTEGER DEFAULT NULL'],
  ['users', 'phone', "TEXT DEFAULT ''"],
  ['users', 'bio', "TEXT DEFAULT ''"],
  // topic_library 扩展
  ['topic_library', 'description', "TEXT DEFAULT ''"],
  ['topic_library', 'tags_json', "TEXT DEFAULT '[]'"],
  ['topic_library', 'source_host', "TEXT DEFAULT ''"],
  ['topic_library', 'source_platform', "TEXT DEFAULT 'other'"],
  ['topic_library', 'embed_url', "TEXT DEFAULT ''"],
  ['topic_library', 'thumbnail_url', "TEXT DEFAULT ''"],
  ['topic_library', 'status', "TEXT DEFAULT 'idea'"],
  ['topic_library', 'created_by', "TEXT DEFAULT ''"],
  // settings 扩展（修复旧库缺失列）
  ['settings', 'created_at', "TEXT NOT NULL DEFAULT ''"],
  ['settings', 'updated_at', "TEXT NOT NULL DEFAULT ''"],
  // media 扩展：内容哈希、传输态、原始文件名
  ['media', 'file_hash', 'TEXT'],
  ['media', 'transfer_state', "TEXT NOT NULL DEFAULT 'ready'"],
  ['media', 'original_filename', "TEXT DEFAULT ''"],
];

const SCHEMA_INDEXES = [
  ['sessions', ['expires_at']],
  ['media', ['review_state', 'created_at']],
  ['media', ['kind', 'created_at']],
  ['media', ['file_hash']],
  ['activity', ['created_at']],
  ['todos', ['done', 'created_at']],
  ['registration_requests', ['status', 'created_at']],
  ['registration_requests', ['username']],
  ['audit_logs', ['created_at']],
];

function migrateSchema() {
  try {
    for (const [table, column, definition] of SCHEMA_MIGRATIONS) {
      ensureColumn(table, column, definition);
    }
    for (const [table, cols] of SCHEMA_INDEXES) {
      ensureIndex(table, cols);
    }
  } catch (error) {
    logDbIssue('schema_migration_failed', error);
  }
}

/**
 * 异步落盘（节流），事件循环空闲时执行
 */
async function flushDatabase() {
  if (!db) return;
  flushTimer = null;

  try {
    const data = Buffer.from(db.export());
    await writeAtomically(config.DB_PATH, data);
  } catch (error) {
    logDbIssue('database_flush_failed', error);
    const tmpPath = `${config.DB_PATH}.tmp`;
    try { await fsp.unlink(tmpPath); } catch (_) { /* ignore cleanup */ }
  } finally {
    activeFlush = null;
  }
}

function scheduleFlush() {
  if (transactionDepth > 0) {
    pendingSave = true;
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    if (activeFlush) {
      activeFlush = activeFlush.then(() => flushDatabase());
    } else {
      activeFlush = flushDatabase();
    }
  }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

/**
 * 安排数据库落盘（节流）
 */
function saveDatabase() {
  if (!db) return;
  scheduleFlush();
}

/**
 * 立即同步落盘，仅用于优雅关停
 */
function saveDatabaseNow() {
  if (!db) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingSave = false;
  try {
    const data = Buffer.from(db.export());
    writeAtomicallySync(config.DB_PATH, data);
  } catch (error) {
    logDbIssue('database_flush_sync_failed', error);
  }
}

/**
 * 执行查询并返回所有结果
 */
function all(sql, params = []) {
  requireDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * 执行查询并返回第一行结果
 */
function get(sql, params = []) {
  requireDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

/**
 * 执行增删改操作
 */
function run(sql, params = []) {
  requireDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

/**
 * 执行事务
 */
function transaction(callback) {
  requireDb();
  const isOuterTransaction = transactionDepth === 0;
  try {
    if (isOuterTransaction) db.exec('BEGIN');
    transactionDepth++;
    const result = callback();
    transactionDepth--;
    if (isOuterTransaction) {
      db.exec('COMMIT');
      if (pendingSave) saveDatabase();
    }
    return result;
  } catch (error) {
    transactionDepth = Math.max(0, transactionDepth - 1);
    if (isOuterTransaction) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        logDbIssue('transaction_rollback_failed', rollbackError);
      }
      pendingSave = false;
    }
    throw error;
  }
}

/**
 * 获取数据库实例
 */
function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  saveDatabase,
  saveDatabaseNow,
  all,
  get,
  run,
  transaction,
  getDb
};
