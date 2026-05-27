const fs = require("fs");
const path = require("path");
const { logServerEvent } = require("../utils/logger");

const ROOT_DIR = path.join(__dirname, "..", "..");

function resolvePath(envPath, defaultPath) {
  if (!envPath) return defaultPath;
  if (path.isAbsolute(envPath)) {
    return path.normalize(envPath);
  }
  return path.resolve(ROOT_DIR, envPath);
}

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = resolvePath(process.env.DATABASE_PATH, path.join(DATA_DIR, "studio.sqlite"));

fs.mkdirSync(DATA_DIR, { recursive: true });

let db = null;

function setDb(instance) {
  db = instance;
}

function getDb() {
  return db;
}

function loadFromDisk(SQL) {
  if (fs.existsSync(DB_PATH)) {
    try {
      return new SQL.Database(fs.readFileSync(DB_PATH));
    } catch (error) {
      logServerEvent("error", "database_open_failed", {
        databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
        error
      });
    }
  }
  return new SQL.Database();
}

function persistDb() {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (error) {
    logServerEvent("error", "database_persist_failed", {
      databasePath: path.relative(ROOT_DIR, DB_PATH).replace(/\\/g, "/"),
      error,
    });
    throw error;
  }
}

function runWrite(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } catch (error) {
    logServerEvent("error", "database_write_failed", { sql, params, error });
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
    logServerEvent("error", "database_read_failed", { sql, params, error });
    throw error;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    persistDb();
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    logServerEvent("error", "database_transaction_failed", { error });
    throw error;
  }
}

function exec(sql) {
  db.exec(sql);
}

module.exports = {
  ROOT_DIR,
  DB_PATH,
  setDb,
  getDb,
  loadFromDisk,
  persistDb,
  runWrite,
  all,
  get,
  transaction,
  exec,
};
