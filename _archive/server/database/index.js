const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { logServerEvent, logDbIssue } = require('../utils/logger');

let db = null;
let DB_PATH = null;
let ROOT_DIR = null;
let PERSIST_DEBOUNCE_MS = 200;

let persistTimer = null;
let persistChain = Promise.resolve();

function initDatabase(config) {
  DB_PATH = config.DB_PATH;
  ROOT_DIR = config.ROOT_DIR;
  PERSIST_DEBOUNCE_MS = config.PERSIST_DEBOUNCE_MS;
}

function createDb(SQL) {
  if (fs.existsSync(DB_PATH)) {
    try {
      return new SQL.Database(fs.readFileSync(DB_PATH));
    } catch (error) {
      logServerEvent('error', 'database_open_failed', {
        databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, '/'),
        error,
      });
    }
  }
  return new SQL.Database();
}

function persistDbSync() {
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, DB_PATH);
  } catch (error) {
    logServerEvent('error', 'database_persist_failed', {
      databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, '/'),
      error,
    });
    throw error;
  }
}

function persistDbNow() {
  persistChain = persistChain.then(() => new Promise((resolve) => {
    let payload;
    try {
      payload = Buffer.from(db.export());
    } catch (error) {
      logServerEvent('error', 'database_persist_failed', {
        databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, '/'),
        stage: 'export',
        error,
      });
      return resolve();
    }
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFile(tmp, payload, (writeErr) => {
      if (writeErr) {
        logServerEvent('error', 'database_persist_failed', {
          databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, '/'),
          stage: 'write',
          error: writeErr,
        });
        return resolve();
      }
      fs.rename(tmp, DB_PATH, (renameErr) => {
        if (renameErr) {
          logServerEvent('error', 'database_persist_failed', {
            databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, '/'),
            stage: 'rename',
            error: renameErr,
          });
        }
        resolve();
      });
    });
  }));
  return persistChain;
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistDbNow();
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersistSync() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  // 等待异步链落地，再做一次同步快照兜底
  persistChain = persistChain.then(() => {
    try {
      persistDbSync();
    } catch (_) { /* already logged */ }
  });
  return persistChain;
}

// 进程退出时确保最后一次写入落盘
let exitFlushed = false;
function exitFlush() {
  if (exitFlushed) return;
  exitFlushed = true;
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistDbSync();
  } catch (_) { /* already logged */ }
}

process.on('SIGINT', () => { exitFlush(); process.exit(0); });
process.on('SIGTERM', () => { exitFlush(); process.exit(0); });
process.on('beforeExit', exitFlush);

function persistDb() {
  schedulePersist();
}

function runWrite(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } catch (error) {
    logServerEvent('error', 'database_write_failed', { sql, params, error });
    throw error;
  } finally {
    stmt.free();
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } catch (error) {
    logServerEvent('error', 'database_read_failed', { sql, params, error });
    throw error;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    persistDb();
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    logServerEvent('error', 'database_transaction_failed', { error });
    throw error;
  }
}

async function setupDatabase() {
  const sqlDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlDir, file),
  });

  db = createDb(SQL);

  // 创建表结构
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
  `);

  // 扩展表字段（兼容已有数据库）
  try {
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
  } catch (error) {
    logDbIssue('team_table_migration_failed', error);
  }

  try {
    const todoColumns = all('PRAGMA table_info(todos)').map(col => col.name);
    if (!todoColumns.includes('due_date')) {
      db.exec('ALTER TABLE todos ADD COLUMN due_date TEXT');
    }
    if (!todoColumns.includes('assignee_id')) {
      db.exec('ALTER TABLE todos ADD COLUMN assignee_id TEXT');
    }
    if (!todoColumns.includes('completed_at')) {
      db.exec('ALTER TABLE todos ADD COLUMN completed_at TEXT');
    }
  } catch (error) {
    logDbIssue('todos_table_migration_failed', error);
  }

  try {
    const userColumns = all('PRAGMA table_info(users)').map((col) => col.name);
    if (!userColumns.includes('display_name')) {
      db.exec("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''");
    }
    if (!userColumns.includes('signature')) {
      db.exec("ALTER TABLE users ADD COLUMN signature TEXT DEFAULT ''");
    }
    if (!userColumns.includes('avatar_url')) {
      db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
    }
  } catch (error) {
    logDbIssue('users_table_migration_failed', error);
  }

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
      CREATE INDEX IF NOT EXISTS idx_media_review_state ON media(review_state);
    `);
  } catch (error) {
    logDbIssue('media_index_migration_failed', error);
  }

  return db;
}

function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  setupDatabase,
  getDb,
  runWrite,
  all,
  get,
  transaction,
  persistDb,
  flushPersistSync,
};
