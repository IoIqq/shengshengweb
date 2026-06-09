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
      value TEXT NOT NULL
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
 * 数据库架构迁移
 */
function migrateSchema() {
  try {
    // 扩展 team 表字段
    const teamColumns = all('PRAGMA table_info(team)').map(col => col.name);
    if (!teamColumns.includes('email')) {
      db.exec("ALTER TABLE team ADD COLUMN email TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('phone')) {
      db.exec("ALTER TABLE team ADD COLUMN phone TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('status')) {
      db.exec("ALTER TABLE team ADD COLUMN status TEXT DEFAULT 'active'");
    }
    if (!teamColumns.includes('joined_at')) {
      db.exec("ALTER TABLE team ADD COLUMN joined_at TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('student_id')) {
      db.exec("ALTER TABLE team ADD COLUMN student_id TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('grade')) {
      db.exec("ALTER TABLE team ADD COLUMN grade TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('major')) {
      db.exec("ALTER TABLE team ADD COLUMN major TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('skills')) {
      db.exec("ALTER TABLE team ADD COLUMN skills TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('bio')) {
      db.exec("ALTER TABLE team ADD COLUMN bio TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('groups')) {
      db.exec("ALTER TABLE team ADD COLUMN groups TEXT DEFAULT ''");
    }
    if (!teamColumns.includes('party_join_at')) {
      db.exec("ALTER TABLE team ADD COLUMN party_join_at TEXT DEFAULT ''");
    }

    // 扩展 devices 表字段
    const deviceColumns = all('PRAGMA table_info(devices)').map(col => col.name);
    if (!deviceColumns.includes('model')) {
      db.exec("ALTER TABLE devices ADD COLUMN model TEXT DEFAULT ''");
    }
    if (!deviceColumns.includes('purchase_date')) {
      db.exec("ALTER TABLE devices ADD COLUMN purchase_date TEXT DEFAULT ''");
    }
    if (!deviceColumns.includes('image')) {
      db.exec("ALTER TABLE devices ADD COLUMN image TEXT DEFAULT ''");
    }
    if (!deviceColumns.includes('serial_no')) {
      db.exec("ALTER TABLE devices ADD COLUMN serial_no TEXT DEFAULT ''");
    }
    if (!deviceColumns.includes('warranty_until')) {
      db.exec("ALTER TABLE devices ADD COLUMN warranty_until TEXT DEFAULT ''");
    }
    if (!deviceColumns.includes('price')) {
      db.exec("ALTER TABLE devices ADD COLUMN price REAL DEFAULT 0");
    }

    // 扩展 users 表字段
    const userColumns = all('PRAGMA table_info(users)').map(col => col.name);
    if (!userColumns.includes('display_name')) {
      db.exec("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''");
    }
    if (!userColumns.includes('signature')) {
      db.exec("ALTER TABLE users ADD COLUMN signature TEXT DEFAULT ''");
    }
    if (!userColumns.includes('avatar_url')) {
      db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
    }
    if (!userColumns.includes('status')) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
    }
    if (!userColumns.includes('last_login_at')) {
      db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT NULL");
    }
    if (!userColumns.includes('created_by')) {
      db.exec("ALTER TABLE users ADD COLUMN created_by INTEGER DEFAULT NULL");
    }
    if (!userColumns.includes('phone')) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");
    }
    if (!userColumns.includes('bio')) {
      db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
    }

    // 扩展 topic_library 表字段
    const topicColumns = all('PRAGMA table_info(topic_library)').map(col => col.name);
    if (!topicColumns.includes('description')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN description TEXT DEFAULT ''");
    }
    if (!topicColumns.includes('tags_json')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN tags_json TEXT DEFAULT '[]'");
    }
    if (!topicColumns.includes('source_host')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN source_host TEXT DEFAULT ''");
    }
    if (!topicColumns.includes('source_platform')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN source_platform TEXT DEFAULT 'other'");
    }
    if (!topicColumns.includes('embed_url')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN embed_url TEXT DEFAULT ''");
    }
    if (!topicColumns.includes('thumbnail_url')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN thumbnail_url TEXT DEFAULT ''");
    }
    if (!topicColumns.includes('status')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN status TEXT DEFAULT 'idea'");
    }
    if (!topicColumns.includes('created_by')) {
      db.exec("ALTER TABLE topic_library ADD COLUMN created_by TEXT DEFAULT ''");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_media_review_created ON media(review_state, created_at);
      CREATE INDEX IF NOT EXISTS idx_media_kind_created ON media(kind, created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
      CREATE INDEX IF NOT EXISTS idx_todos_done_created ON todos(done, created_at);
      CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created ON registration_requests(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_registration_requests_username ON registration_requests(username);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    `);
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

  const tmpPath = `${config.DB_PATH}.tmp`;
  try {
    const data = Buffer.from(db.export());
    await fsp.mkdir(path.dirname(config.DB_PATH), { recursive: true });
    await fsp.writeFile(tmpPath, data);
    await fsp.rename(tmpPath, config.DB_PATH);
  } catch (error) {
    logDbIssue('database_flush_failed', error);
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
    const tmpPath = `${config.DB_PATH}.tmp`;
    fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, config.DB_PATH);
  } catch (error) {
    logDbIssue('database_flush_sync_failed', error);
  }
}

/**
 * 执行查询并返回所有结果
 */
function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
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
  if (!db) throw new Error('Database not initialized');
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
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

/**
 * 执行事务
 */
function transaction(callback) {
  if (!db) throw new Error('Database not initialized');
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
