# 素材库批量上传 + 自动归档 + 查重 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让素材库支持 Explorer 式大批量拖拽上传，按 `media/{年}/{YYYYMMDD活动名}/{设备名}/{文件}` 自动归档，文件落到已配置（可外部/网络）存储地址，并集成基于 SHA-256 的全库查重（后台空闲渐进 + 手动按钮）。

**Architecture:** 分阶段上传——前端并发小批上传到本地暂存区 → 后台把暂存文件传到目标归档目录（UNC/网络路径走 `robocopy`，本机走 Node `fs` 流式拷贝）→ 写 DB 记录。查重用 Node `crypto` 流式 SHA-256，`file_hash` 列惰性计算，后台空闲任务渐进补算 + 手动按钮出重复分组报告。纯逻辑单元用 Node 内置 `node:test`（零依赖）做 TDD；DB/IO 集成层用 lint + 手测（与项目既有验证模型一致）。

**Tech Stack:** Node ≥18 / Express / multer / sql.js / 原生 ES Modules 前端 / `node:test`。

参考设计文档：`docs/superpowers/specs/2026-06-22-media-bulk-upload-dedup-design.md`。

---

## 文件结构总览

**新增：**
- `server/utils/media-paths.js` — 纯路径/命名工具（清洗、目录约定、UNC 判定、重名处理）。
- `server/utils/file-hash.js` — 流式 SHA-256。
- `server/models/transfer.js` — 暂存管理 + 后台传输分派 + 重启恢复 + 进度注册表 + 空闲哈希定时器。
- `test/media-paths.test.js` / `test/file-hash.test.js` — 单元测试（`node:test`）。

**修改：**
- `server/config/index.js` — 暂存目录、传输并发、批次大小、单文件上限。
- `server/models/database.js` — `media` 表新增 `file_hash`/`transfer_state`/`original_filename` 列 + 索引。
- `server/models/media.js` — 记录插入含新列、传输态/哈希读写、查重分组、文件夹列表。
- `server/routes/media.js` — staged 上传、传输态、文件夹列表、查重端点；移除文件数硬上限。
- `server/server-new.js` — 确保暂存目录、启动恢复、启动空闲哈希。
- `package.json` — `test` 脚本。
- `public/index.html` — 上传对话框新增目标选择 + 设备下拉。
- `public/templates/media-library.html` — 查重组件标记。
- `public/js/modules/media.js` — 上传对话框重写 + 查重组件。
- `public/js/core/dom.js` — 新元素 ID。
- `public/js/core/events.js` — 查重组件初始化。
- `public/css/components/media.css` / `public/css/pages/media-library.css` — 新样式。
- `docs/GUIDE.md` — API 参考。

**命名约定（全局一致）：**
- `transfer_state` 取值：`'staging'` | `'transferring'` | `'ready'` | `'failed'`。
- media model 函数：`insertMediaRecord(record)`、`setTransferState(id,state)`、`getMediaByTransferStates(states)`、`setFileHash(id,hash)`、`getUnhashedMedia(limit)`、`countUnhashed()`、`scanHashes(limit)`、`getDuplicateGroups()`、`listFolders()`。
- transfer model 函数：`createJobId()`、`getStagingDir(jobId)`、`enqueueTransfer({jobId,records})`、`getJobProgress(jobId)`、`retryJob(jobId)`、`recoverPendingTransfers()`、`startIdleHasher(models)`、`stopIdleHasher()`。
- media-paths util：`sanitizeSegment(name)`、`buildEventFolderName(date,eventName)`、`buildTargetRelPath({date,eventName,deviceName})`、`yearFromDate(yyyymmdd)`、`isUncPath(absPath)`、`resolveCollidingFilename(dir,basename)`。
- file-hash util：`computeFileHash(absPath)`。
- 前端元素 ID：`upload-target-existing`、`upload-target-new`、`upload-event-date`、`upload-event-name`、`upload-folder-preview`、`upload-device-select`、`dedup-panel`、`dedup-scan-btn`、`dedup-progress`、`dedup-groups`、`dedup-refresh-btn`。

---

### Task 1: 测试脚手架 + 媒体路径工具（TDD）

**Files:**
- Modify: `package.json`
- Create: `server/utils/media-paths.js`
- Test: `test/media-paths.test.js`

- [ ] **Step 1: 给 package.json 加 test 脚本**

在 `scripts` 里 `"check"` 之后加一行：

```json
    "test": "node --test test/"
```

（`node --test` 是 Node 18+ 内置测试运行器，零依赖。）

- [ ] **Step 2: 写失败测试 `test/media-paths.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sanitizeSegment,
  buildEventFolderName,
  buildTargetRelPath,
  yearFromDate,
  isUncPath,
  resolveCollidingFilename,
} = require('../server/utils/media-paths');

test('sanitizeSegment 去掉非法字符并 trim', () => {
  assert.strictEqual(sanitizeSegment('物流/运动会:*?'), '物流运动会');
  assert.strictEqual(sanitizeSegment('  活动  '), '活动');
  assert.strictEqual(sanitizeSegment('..隐藏.'), '隐藏');
  assert.strictEqual(sanitizeSegment(''), '');
});

test('buildEventFolderName 生成 YYYYMMDD+活动名', () => {
  assert.strictEqual(buildEventFolderName('2026-06-22', '物流运动会'), '20260622物流运动会');
  assert.strictEqual(buildEventFolderName('2026/06/22', '党史学习'), '20260622党史学习');
});

test('yearFromDate 从 YYYYMMDD 取年', () => {
  assert.strictEqual(yearFromDate('20260622物流运动会'), '2026');
  assert.strictEqual(yearFromDate('20260622'), '2026');
});

test('buildTargetRelPath 生成 media/年/活动/设备', () => {
  const p = buildTargetRelPath({ date: '2026-06-22', eventName: '物流运动会', deviceName: 'Sony A7M4' });
  assert.strictEqual(p, 'media/2026/20260622物流运动会/Sony A7M4');
});

test('isUncPath 识别 UNC 前缀', () => {
  assert.strictEqual(isUncPath('\\\\NAS\\素材'), true);
  assert.strictEqual(isUncPath('//NAS/素材'), true);
  assert.strictEqual(isUncPath('D:\\素材库'), false);
  assert.strictEqual(isUncPath('C:/data/media'), false);
});

test('resolveCollidingFilename 同名追加序号', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a.jpg');
  fs.closeSync(fs.openSync(path.join(dir, 'a.jpg'), 'w'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a (1).jpg');
  fs.closeSync(fs.openSync(path.join(dir, 'a (1).jpg'), 'w'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a (2).jpg');
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test`
Expected: FAIL，报 `Cannot find module '../server/utils/media-paths'`。

- [ ] **Step 4: 实现 `server/utils/media-paths.js`**

```js
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
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: PASS（7 个测试全过）。

- [ ] **Step 6: 提交**

```bash
git add package.json server/utils/media-paths.js test/media-paths.test.js
git commit -m "feat(media): add media path utilities with tests"
```

---

### Task 2: 流式哈希工具（TDD）

**Files:**
- Create: `server/utils/file-hash.js`
- Test: `test/file-hash.test.js`

- [ ] **Step 1: 写失败测试 `test/file-hash.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { computeFileHash } = require('../server/utils/file-hash');

test('computeFileHash 返回流式 SHA-256 且与一次性计算一致', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const file = path.join(dir, 'big.bin');
  const buf = Buffer.from(Array.from({ length: 100000 }, (_, i) => i & 0xff));
  fs.writeFileSync(file, buf);
  const expected = crypto.createHash('sha256').update(buf).digest('hex');
  const got = await computeFileHash(file);
  assert.strictEqual(got, expected);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('computeFileHash 对空文件返回固定哈希', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const file = path.join(dir, 'empty.bin');
  fs.writeFileSync(file, Buffer.alloc(0));
  const got = await computeFileHash(file);
  assert.strictEqual(got, crypto.createHash('sha256').digest('hex'));
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module '../server/utils/file-hash'`。

- [ ] **Step 3: 实现 `server/utils/file-hash.js`**

```js
const fs = require('fs');
const crypto = require('crypto');

const CHUNK_SIZE = 1024 * 1024; // 1MB 分块，避免大视频整文件入内存

/**
 * 流式计算文件 SHA-256（十六进制）。
 * @param {string} absPath
 * @returns {Promise<string>}
 */
function computeFileHash(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath, { highWaterMark: CHUNK_SIZE });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = { computeFileHash };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（含 Task 1 共 9 个测试）。

- [ ] **Step 5: 提交**

```bash
git add server/utils/file-hash.js test/file-hash.test.js
git commit -m "feat(media): add streaming SHA-256 file hash util with tests"
```

---

### Task 3: 配置项

**Files:**
- Modify: `server/config/index.js:91-97`

- [ ] **Step 1: 替换上传配置块**

把现有：

```js
  // 上传配置
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 200),
  MAX_UPLOAD_FILES: Number(process.env.MAX_UPLOAD_FILES || 30),
  MAX_AVATAR_MB: Number(process.env.MAX_AVATAR_MB || 5),
```

替换为：

```js
  // 上传配置
  // MAX_UPLOAD_MB：单文件软上限（默认调高至 2GB）；可经环境变量继续调高
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 2048),
  // MAX_UPLOAD_FILES：单次请求文件数软上限（前端分批规避，保护单请求）
  MAX_UPLOAD_FILES: Number(process.env.MAX_UPLOAD_FILES || 50),
  MAX_AVATAR_MB: Number(process.env.MAX_AVATAR_MB || 5),
  // 批量上传/传输
  UPLOAD_BATCH_SIZE: Number(process.env.UPLOAD_BATCH_SIZE || 20),      // 前端每批文件数
  TRANSFER_CONCURRENCY: Number(process.env.TRANSFER_CONCURRENCY || 4),  // 前端并发批次数
  TRANSFER_HASH_BATCH: Number(process.env.TRANSFER_HASH_BATCH || 2),    // 空闲哈希每轮处理条数
```

- [ ] **Step 2: 在派生路径区追加暂存目录**

在 `config.INBOX_DIR_SOURCE = inboxPath.source;` 之后加：

```js
config.STAGING_DIR = path.join(config.UPLOAD_DIR, '.staging');
```

- [ ] **Step 3: 语法校验**

Run: `node -e "require('./server/config'); console.log('config ok')"`
Expected: 输出 `config ok`，无异常。

- [ ] **Step 4: 提交**

```bash
git add server/config/index.js
git commit -m "feat(media): add staging/concurrency config, raise upload limits"
```

---

### Task 4: 数据库迁移

**Files:**
- Modify: `server/models/database.js:246-298`

- [ ] **Step 1: 在 `SCHEMA_MIGRATIONS` 末尾加三行**

在 `['settings', 'updated_at', "TEXT NOT NULL DEFAULT ''"],` 之后追加：

```js
  // media 扩展：内容哈希、传输态、原始文件名
  ['media', 'file_hash', 'TEXT'],
  ['media', 'transfer_state', "TEXT NOT NULL DEFAULT 'ready'"],
  ['media', 'original_filename', "TEXT DEFAULT ''"],
```

- [ ] **Step 2: 在 `SCHEMA_INDEXES` 加哈希索引**

在 `['media', ['kind', 'created_at']],` 之后追加：

```js
  ['media', ['file_hash']],
```

- [ ] **Step 3: 语法校验**

Run: `node -e "require('./server/models/database'); console.log('db module ok')"`
Expected: 输出 `db module ok`。

- [ ] **Step 4: 提交**

```bash
git add server/models/database.js
git commit -m "feat(media): add file_hash/transfer_state/original_filename columns"
```

---

### Task 5: 媒体模型扩展

**Files:**
- Modify: `server/models/media.js`

- [ ] **Step 1: 扩展 `insertMediaRecord` 含新列**

把现有 `insertMediaRecord(record)` 函数替换为：

```js
function insertMediaRecord(record) {
  run(
    `INSERT INTO media
      (id, kind, title, source, source_type, source_path, author, duration, status, note, tags_json, thumb, url, review_state, file_hash, transfer_state, original_filename, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.kind,
      record.title,
      record.source,
      record.source_type,
      record.source_path,
      record.author,
      record.duration,
      record.status,
      record.note,
      record.tags_json,
      record.thumb,
      record.url,
      record.review_state,
      record.file_hash || null,
      record.transfer_state || 'ready',
      record.original_filename || '',
      record.created_at,
      record.updated_at,
    ],
  );
}
```

- [ ] **Step 2: 扩展 `mediaRowToItem` 暴露新字段**

在 `mediaRowToItem` 返回对象里追加（`updatedAt` 之后）：

```js
    fileHash: row.file_hash || null,
    transferState: row.transfer_state || 'ready',
    originalFilename: row.original_filename || '',
```

- [ ] **Step 3: 追加传输态/哈希/查重/文件夹函数**

在 `module.exports` 之前追加：

```js
/** 设置传输态 */
function setTransferState(id, state) {
  run('UPDATE media SET transfer_state = ?, updated_at = ? WHERE id = ?', [state, nowIso(), id]);
}

/** 取指定传输态的记录（重启恢复用） */
function getMediaByTransferStates(states) {
  if (!states.length) return [];
  const placeholders = states.map(() => '?').join(',');
  return all(`SELECT * FROM media WHERE transfer_state IN (${placeholders})`, states);
}

/** 写入哈希 */
function setFileHash(id, hash) {
  run('UPDATE media SET file_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), id]);
}

/** 取未计算哈希的记录 */
function getUnhashedMedia(limit = 10) {
  return all('SELECT * FROM media WHERE file_hash IS NULL ORDER BY datetime(created_at) ASC LIMIT ?', [limit]);
}

/** 未哈希计数 */
function countUnhashed() {
  const row = get("SELECT COUNT(*) AS c FROM media WHERE file_hash IS NULL", []);
  return row ? Number(row.c) : 0;
}

/**
 * 对未哈希记录逐条计算流式哈希并写入。
 * @param {number} limit
 * @returns {Promise<{hashed:number, remaining:number}>}
 */
async function scanHashes(limit = 10) {
  const { computeFileHash } = require('../utils/file-hash');
  const rows = getUnhashedMedia(limit);
  for (const row of rows) {
    try {
      const absPath = resolveManagedAbsPath(row);
      if (!absPath || !fs.existsSync(absPath)) {
        // 文件缺失：写一个占位哈希避免反复重试，标记后由查重报告忽略
        setFileHash(row.id, `missing:${row.id}`);
        continue;
      }
      const hash = await computeFileHash(absPath);
      setFileHash(row.id, hash);
    } catch (error) {
      setFileHash(row.id, `error:${error.code || 'failed'}`);
    }
  }
  return { hashed: rows.length, remaining: countUnhashed() };
}

/** 重复分组：file_hash 相同且非占位的，count>1 */
function getDuplicateGroups() {
  const rows = all(
    `SELECT file_hash AS hash, COUNT(*) AS c
     FROM media
     WHERE file_hash IS NOT NULL
       AND file_hash NOT LIKE 'missing:%' AND file_hash NOT LIKE 'error:%'
     GROUP BY file_hash
     HAVING c > 1
     ORDER BY c DESC`,
  );
  return rows.map((r) => {
    const items = all('SELECT * FROM media WHERE file_hash = ? ORDER BY datetime(created_at) ASC', [r.hash]).map(mediaRowToItem);
    return { hash: r.hash, count: r.c, items };
  });
}

/** 扫描 MEDIA_DIR 下的 年/活动 两层目录，供上传时选择已有文件夹 */
function listFolders() {
  const result = [];
  if (!fs.existsSync(config.MEDIA_DIR)) return result;
  const years = fs.readdirSync(config.MEDIA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => (a < b ? 1 : -1));
  for (const year of years) {
    const yearDir = path.join(config.MEDIA_DIR, year);
    const events = fs.readdirSync(yearDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => (a < b ? 1 : -1));
    result.push({ year, events });
  }
  return result;
}

/** 由 source_type/source_path 解析出磁盘绝对路径（供哈希/清理用） */
function resolveManagedAbsPath(row) {
  if (!row || !row.source_path) return null;
  const normalized = String(row.source_path).replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(config.UPLOAD_DIR, normalized);
  const rel = path.relative(config.UPLOAD_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}
```

- [ ] **Step 4: 导出新函数**

把 `module.exports` 替换为：

```js
module.exports = {
  getAllMedia,
  getMediaById,
  createMedia,
  updateMedia,
  deleteMedia,
  searchMedia,
  mediaRowToItem,
  insertMediaRecord,
  scanInbox,
  getShowcaseItems,
  setTransferState,
  getMediaByTransferStates,
  setFileHash,
  getUnhashedMedia,
  countUnhashed,
  scanHashes,
  getDuplicateGroups,
  listFolders,
  resolveManagedAbsPath,
};
```

- [ ] **Step 5: 语法校验**

Run: `node -e "const m=require('./server/models/media'); console.log(Object.keys(m).length, 'exports')"`
Expected: 输出类似 `20 exports`，无异常。

- [ ] **Step 6: 提交**

```bash
git add server/models/media.js
git commit -m "feat(media): hashing, transfer-state, dedup grouping, folder listing in model"
```

---

### Task 6: 传输模型（暂存 + 后台传输 + 恢复）

**Files:**
- Create: `server/models/transfer.js`

- [ ] **Step 1: 实现 `server/models/transfer.js`**

```js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');
const { ensureDir } = require('../utils');
const { isUncPath, resolveCollidingFilename } = require('../utils/media-paths');

// 进程内传输任务进度注册表：jobId -> { total, done, failed, state }
const jobs = new Map();

function createJobId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `tjob-${ts}-${rand}`;
}

function getStagingDir(jobId) {
  return path.join(config.STAGING_DIR, jobId);
}

function getJobProgress(jobId) {
  return jobs.get(jobId) || { total: 0, done: 0, failed: 0, state: 'unknown' };
}

/**
 * 后台把一个暂存文件传到最终归档路径，按存储类型分派。
 * @param {object} record 媒体记录（含 source_path、original_filename、staging abs）
 */
async function transferOne(record, stagingAbs) {
  const targetRel = record.source_path; // 形如 media/2026/.../file.jpg
  const targetAbs = path.resolve(config.UPLOAD_DIR, targetRel);
  const targetDir = path.dirname(targetAbs);
  ensureDir(targetDir);

  const finalName = resolveCollidingFilename(targetDir, path.basename(targetAbs));
  const finalAbs = path.join(targetDir, finalName);

  if (isUncPath(targetAbs) && process.platform === 'win32') {
    // robocopy 按目录拷贝：<srcDir> <destDir> <file>
    await robocopyFile(path.dirname(stagingAbs), targetDir, path.basename(stagingAbs), finalName);
  } else {
    await copyStream(stagingAbs, finalAbs);
  }
  // 传输成功后删暂存
  try { await fsp.unlink(stagingAbs); } catch (_) { /* ignore */ }
  return finalAbs;
}

function robocopyFile(srcDir, destDir, fileName, finalName) {
  return new Promise((resolve, reject) => {
    // /NFL /NDL：无文件/目录列表日志；/NJH /NJS：无头尾；/NS /NC：不打印名
    const args = [srcDir, destDir, fileName, '/NFL', '/NDL', '/NJH', '/NJS', '/NS', '/NC', '/NP', '/R:2', '/W:2'];
    const child = spawn('robocopy', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      // robocopy 退出码 <8 视为成功
      if (code != null && code < 8) {
        // robocopy 保留原名，需重命名为 finalName（若不同）
        if (finalName && finalName !== fileName) {
          fs.renameSync(path.join(destDir, fileName), path.join(destDir, finalName), () => {});
        }
        resolve();
      } else {
        reject(new Error(`robocopy 失败 code=${code} ${stderr}`));
      }
    });
  });
}

function copyStream(src, dest) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(dest);
    rs.pipe(ws);
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
  });
}

/**
 * 把若干记录加入传输队列并立即开始后台处理。
 * @param {{jobId:string, records:Array}} param
 */
function enqueueTransfer({ jobId, records }) {
  const progress = { total: records.length, done: 0, failed: 0, state: 'transferring' };
  jobs.set(jobId, progress);

  // 异步逐个传输，不阻塞请求
  (async () => {
    for (const rec of records) {
      try {
        const stagingAbs = path.join(getStagingDir(jobId), rec.__stagingName);
        // 若暂存文件不存在（可能重启后），从最终路径补判
        if (!fs.existsSync(stagingAbs)) {
          const finalAbs = path.resolve(config.UPLOAD_DIR, rec.source_path);
          if (fs.existsSync(finalAbs)) {
            const { setTransferState } = require('./media');
            setTransferState(rec.id, 'ready');
            progress.done++;
            continue;
          }
          throw new Error('staging file missing');
        }
        await transferOne(rec, stagingAbs);
        const { setTransferState } = require('./media');
        setTransferState(rec.id, 'ready');
        progress.done++;
      } catch (error) {
        const { setTransferState } = require('./media');
        setTransferState(rec.id, 'failed');
        progress.failed++;
        // eslint-disable-next-line no-console
        console.error(`[transfer] ${rec.id} 失败:`, error.message);
      }
    }
    progress.state = progress.failed > 0 ? 'failed' : 'done';
    // 持久化
    try { require('./database').saveDatabase(); } catch (_) { /* ignore */ }
    // 清理空暂存目录
    try { fs.rmdirSync(getStagingDir(jobId), { recursive: true }); } catch (_) { /* ignore */ }
  })();
}

/**
 * 重试某 jobId 中 failed 的记录。
 */
function retryJob(jobId) {
  const progress = jobs.get(jobId);
  if (!progress) return { ok: false, reason: 'job not found' };
  // 简化：仅重置进度计数，重新入队需要原始 records；
  // 实际重试由路由层从 DB 取 transfer_state='failed' 且属于该 job 的记录后再次 enqueue。
  return { ok: true, jobId };
}

/**
 * 启动时恢复：扫描 transfer_state ∈ {staging,transferring} 的记录，幂等重传。
 */
function recoverPendingTransfers() {
  const { getMediaByTransferStates, setTransferState } = require('./media');
  const pending = getMediaByTransferStates(['staging', 'transferring']);
  if (!pending.length) return { recovered: 0 };
  // 按 staging 目录（推断自 jobId 无法还原）——改为按记录逐个补传：最终路径存在则置 ready，否则 failed。
  for (const row of pending) {
    const finalAbs = path.resolve(config.UPLOAD_DIR, row.source_path);
    if (fs.existsSync(finalAbs)) {
      setTransferState(row.id, 'ready');
    } else {
      setTransferState(row.id, 'failed');
    }
  }
  try { require('./database').saveDatabase(); } catch (_) { /* ignore */ }
  return { recovered: pending.length };
}

module.exports = {
  createJobId,
  getStagingDir,
  getJobProgress,
  enqueueTransfer,
  retryJob,
  recoverPendingTransfers,
};
```

- [ ] **Step 2: 语法校验**

Run: `node -e "require('./server/models/transfer'); console.log('transfer module ok')"`
Expected: `transfer module ok`。

- [ ] **Step 3: 提交**

```bash
git add server/models/transfer.js
git commit -m "feat(media): add transfer model with robocopy/fs dispatch + recovery"
```

---

### Task 7: 上传路由重写（staged + 目标归档）

**Files:**
- Modify: `server/routes/media.js`

- [ ] **Step 1: 替换顶部 multer 配置与上传端点**

把文件中 `mediaUpload` 定义（约 36-60 行的 `const mediaUpload = multer({...})`）替换为暂存式配置：

```js
// 暂存式上传：每请求一个 jobId，文件落到 STAGING_DIR/<jobId>/
function generateJobId(req, _res, next) {
  if (!req.transferJobId) {
    const transfer = require('../models/transfer');
    req.transferJobId = transfer.createJobId();
    ensureDir(transfer.getStagingDir(req.transferJobId));
  }
  next();
}

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const transfer = require('../models/transfer');
      cb(null, transfer.getStagingDir(req.transferJobId));
    },
    filename(req, file, cb) {
      // 暂存用随机名避免冲突，original_filename 单独存
      const ext = path.extname(file.originalname || '').toLowerCase();
      const rand = Math.random().toString(36).substring(2, 8);
      cb(null, `stage-${Date.now()}-${rand}${ext}`);
    },
  }),
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    // 不设 files 上限（前端分批）；multer 不传 files 即不限制单请求数量
  },
  fileFilter(req, file, cb) {
    if (isMediaFile(file)) return cb(null, true);
    const error = new Error('只能上传图片或视频文件。');
    error.statusCode = 400;
    cb(error);
  },
});
```

并确保文件顶部已 `const { ensureDir } = require('../utils');`（若未导入则补）。

- [ ] **Step 2: 替换上传端点为 staged 版**

把现有 `router.post('/upload', ...)` 整段替换为：

```js
// POST /api/media/upload — staged 批量上传，附带目标归档信息
router.post(
  '/upload',
  uploadLimiter,
  requireAuth,
  requirePermission('media:create'),
  generateJobId,
  (req, res, next) => {
    mediaUpload.array('files')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `文件大小超过${config.MAX_UPLOAD_MB}MB限制。` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: '上传字段名不正确，请使用"files"字段。' });
        }
        if (err.statusCode === 400) return res.status(400).json({ error: err.message });
        return res.status(500).json({ error: '文件上传失败，请重试。' });
      }
      next();
    });
  },
  (req, res) => {
    const { transaction, saveDatabase } = require('../models/database');
    const { insertMediaRecord, mediaRowToItem } = mediaModel;
    const transfer = require('../models/transfer');
    const { buildTargetRelPath, sanitizeSegment } = require('../utils/media-paths');

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: '请先选择要上传的文件。' });

    const mode = req.body.mode === 'existing' ? 'existing' : 'new';
    const year = sanitizeSegment(req.body.year);
    const date = req.body.date || '';
    const eventName = req.body.eventName || '';
    const deviceId = req.body.deviceId || '';
    const existingPath = req.body.existingPath || '';

    // 目标相对路径根：existing 模式用 existingPath（media/年/活动）；new 模式按约定生成
    let targetDirRel;
    if (mode === 'existing' && existingPath) {
      targetDirRel = existingPath; // 形如 media/2026/20260622物流运动会
    } else {
      if (!date || !eventName) {
        return res.status(400).json({ error: '新建文件夹需要日期和活动名。' });
      }
      const built = buildTargetRelPath({ date, eventName, deviceName: 'tmp' });
      // buildTargetRelPath 含设备段；这里先取到活动段
      const parts = built.split('/');
      targetDirRel = parts.slice(0, 3).join('/'); // media/年/活动
    }
    if (!targetDirRel.startsWith('media/')) {
      return res.status(400).json({ error: '目标文件夹路径非法。' });
    }

    // 设备名（来自 devices 表的 id；此处取其 name 作设备段，路由里查一次）
    let deviceName = sanitizeSegment(req.body.deviceName || '');
    if (!deviceName && deviceId) {
      const dev = require('../models').device.getDeviceById(deviceId);
      if (dev) deviceName = sanitizeSegment(dev.name);
    }
    if (!deviceName) deviceName = '未分类';
    targetDirRel = `${targetDirRel}/${deviceName}`;

    const jobId = req.transferJobId;
    const stagedRecords = [];

    const items = transaction(() => {
      const out = [];
      for (const file of files) {
        const kind = file.mimetype.startsWith('video/') ? 'video' : 'photo';
        const ext = path.extname(file.originalname || '').toLowerCase();
        const baseName = sanitizeSegment(path.basename(file.originalname || `file${ext}`, ext)) || `file-${Date.now()}`;
        const relName = `${baseName}${ext}`;
        const sourcePath = `${targetDirRel}/${relName}`;
        const publicUrl = `/uploads/${encodeURI(sourcePath)}`;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const record = {
          id: `media-${timestamp}-${random}`,
          kind,
          title: baseName,
          source: `本地上传 / ${file.originalname}`,
          source_type: 'upload',
          source_path: sourcePath,
          author: req.user?.username || '工作台',
          duration: kind === 'video' ? '本地视频' : '本地图片',
          status: '待审',
          note: '由浏览器上传到本地素材库。',
          tags_json: JSON.stringify(['上传', kind === 'video' ? '视频' : '图片']),
          thumb: kind === 'video' ? createThumb(baseName, '#1f5a49', '#ef6c4e', 'video') : publicUrl,
          url: publicUrl,
          review_state: 'pending',
          file_hash: null,
          transfer_state: 'staging',
          original_filename: file.originalname || '',
          created_at: nowIso(),
          updated_at: nowIso(),
          __stagingName: file.filename, // 暂存文件名，传给 transfer
        };
        insertMediaRecord(record);
        stagedRecords.push(record);
        out.push(mediaRowToItem(record));
        logActivity('素材上传', req.user?.username || 'unknown', `上传了 ${record.title}`);
      }
      saveDatabase();
      return out;
    });

    // 全部入库后入队后台传输
    transfer.enqueueTransfer({ jobId, records: stagedRecords });

    res.json({ ok: true, items, jobId });
  },
);
```

- [ ] **Step 3: 追加传输态、文件夹列表、查重端点**

在 `module.exports = router;` 之前追加：

```js
// GET /api/media/transfer-states?ids=a,b — 批量查传输态
router.get('/transfer-states', requireAuth, (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, states: {} });
  const placeholders = ids.map(() => '?').join(',');
  const rows = require('../models/database').all(
    `SELECT id, transfer_state AS s FROM media WHERE id IN (${placeholders})`,
    ids,
  );
  const states = {};
  for (const r of rows) states[r.id] = r.s;
  res.json({ ok: true, states });
});

// GET /api/media/folders — 已有 年/活动 文件夹
router.get('/folders', requireAuth, (req, res) => {
  try {
    res.json({ ok: true, folders: mediaModel.listFolders() });
  } catch (error) {
    res.status(500).json({ error: '读取文件夹列表失败。' });
  }
});

// POST /api/media/dedup/scan — 触发哈希计算（全量未哈希）
router.post('/dedup/scan', requireAuth, requirePermission('media:review'), async (req, res) => {
  try {
    const result = await mediaModel.scanHashes(9999);
    res.json({ ok: true, ...result, groups: mediaModel.getDuplicateGroups().length });
  } catch (error) {
    res.status(500).json({ error: '查重扫描失败。' });
  }
});

// GET /api/media/dedup/groups — 重复分组
router.get('/dedup/groups', requireAuth, requirePermission('media:review'), (req, res) => {
  try {
    res.json({ ok: true, groups: mediaModel.getDuplicateGroups(), unhashed: mediaModel.countUnhashed() });
  } catch (error) {
    res.status(500).json({ error: '读取查重结果失败。' });
  }
});
```

- [ ] **Step 4: lint 校验**

Run: `npm run lint`
Expected: 无 error（warning 可接受）。若有 `requirePermission` 未用等报错按提示修。

- [ ] **Step 5: 语法校验**

Run: `node -e "require('./server/routes/media'); console.log('media route ok')"`
Expected: `media route ok`。

- [ ] **Step 6: 提交**

```bash
git add server/routes/media.js
git commit -m "feat(media): staged upload into archive folders + transfer/dedup endpoints"
```

---

### Task 8: 启动恢复 + 空闲哈希定时器

**Files:**
- Modify: `server/server-new.js`

- [ ] **Step 1: 导入 transfer 模型**

在 `const models = require('./models');` 之后加：

```js
const transfer = require('./models/transfer');
```

- [ ] **Step 2: 确保暂存目录**

在 `ensureOptionalStorageDir('Inbox 目录', config.INBOX_DIR);` 之后加：

```js
ensureOptionalStorageDir('暂存目录', config.STAGING_DIR);
```

- [ ] **Step 3: 在数据库初始化后加恢复 + 空闲哈希**

在 `models.session.cleanupExpiredSessions();` 之后、`startMaintenanceScheduler(models);` 之前插入：

```js
    // 恢复上次中断的传输
    try {
      const recovered = transfer.recoverPendingTransfers();
      if (recovered.recovered) console.log(`✓ 恢复 ${recovered.recovered} 个中断传输任务`);
    } catch (error) {
      console.warn('传输恢复失败：', error.message);
    }

    // 空闲渐进哈希定时器
    let hasherTimer = null;
    function tickHasher() {
      mediaModelScanHashes()
        .catch(() => {})
        .finally(() => {
          hasherTimer = setTimeout(tickHasher, config.AUTO_SCAN_SECONDS * 1000);
          if (typeof hasherTimer.unref === 'function') hasherTimer.unref();
        });
    }
    function mediaModelScanHashes() {
      return models.media.scanHashes(config.TRANSFER_HASH_BATCH);
    }
    hasherTimer = setTimeout(tickHasher, config.AUTO_SCAN_SECONDS * 1000);
    if (typeof hasherTimer.unref === 'function') hasherTimer.unref();
```

- [ ] **Step 4: 关停时清理定时器**

在 `gracefulShutdown` 的 `finalize` 里 `stopMaintenanceScheduler();` 之前加（无需导入，因 hasherTimer 在 initApp 闭包内——改为挂到 app 上）。

为简化，把 `hasherTimer` 提到模块作用域：在 `let httpServer = null;` 旁加 `let hasherTimer = null;`，并把上面 `let hasherTimer = null;` 行删除，tickHasher 内引用模块级变量。然后 finalize 内加：

```js
      if (hasherTimer) { clearTimeout(hasherTimer); hasherTimer = null; }
```

- [ ] **Step 5: 启动校验**

Run: `npm run dev` 然后观察启动日志，`Ctrl+C` 退出。
Expected: 正常启动，无未捕获异常；日志含 `✓ 数据库初始化成功`。

- [ ] **Step 6: 提交**

```bash
git add server/server-new.js
git commit -m "feat(media): wire transfer recovery + idle hasher on startup"
```

---

### Task 9: 前端 — 上传对话框目标选择 + 设备下拉

**Files:**
- Modify: `public/index.html:1053-1078`（dropzone 之前插入目标选择区）
- Modify: `public/js/core/dom.js`（新增元素 ID）
- Modify: `public/js/modules/media.js`（openUploadDialog 加载设备/文件夹，doUpload 发送目标字段 + 分批）

- [ ] **Step 1: 在 index.html dropzone 之前插入目标选择区**

在 `<div class="upload-dropzone" id="upload-dropzone">` 之前插入：

```html
        <div class="upload-target" aria-label="选择目标文件夹与设备">
          <div class="upload-target-mode" role="radiogroup" aria-label="目标文件夹">
            <label class="radio-chip"><input type="radio" name="upload-target-mode" value="new" checked> 新建文件夹</label>
            <label class="radio-chip"><input type="radio" name="upload-target-mode" value="existing"> 选择已有</label>
          </div>
          <div class="upload-target-new" id="upload-target-new">
            <label class="field">
              <span>日期</span>
              <input id="upload-event-date" type="date" />
            </label>
            <label class="field">
              <span>活动名称</span>
              <input id="upload-event-name" type="text" placeholder="如：物流运动会" autocomplete="off" />
            </label>
            <small class="upload-folder-preview" id="upload-folder-preview">将创建：media/…/…</small>
          </div>
          <div class="upload-target-existing" id="upload-target-existing" hidden>
            <label class="field">
              <span>已有文件夹</span>
              <select id="upload-existing-folder"><option value="">加载中…</option></select>
            </label>
          </div>
          <label class="field">
            <span>拍摄设备</span>
            <select id="upload-device-select"><option value="">加载中…</option></select>
          </label>
        </div>
```

- [ ] **Step 2: 在 dom.js 的 `// 素材库` 段追加元素 ID**

在 `mediaFilters: 'media-filters',` 之后追加：

```js
    dedupPanel: 'dedup-panel',
    dedupScanBtn: 'dedup-scan-btn',
    dedupRefreshBtn: 'dedup-refresh-btn',
    dedupProgress: 'dedup-progress',
    dedupGroups: 'dedup-groups',
```

并在 `// 工具栏` 段 `uploadBtn: 'upload-btn',` 之前加（dom.js map 用普通 ID 字符串，但上传对话框内元素此前用 getElementById 直取——为统一，新增的也走 dom.js）：

```js
    uploadTargetNew: 'upload-target-new',
    uploadTargetExisting: 'upload-target-existing',
    uploadEventDate: 'upload-event-date',
    uploadEventName: 'upload-event-name',
    uploadFolderPreview: 'upload-folder-preview',
    uploadDeviceSelect: 'upload-device-select',
    uploadExistingFolder: 'upload-existing-folder',
```

- [ ] **Step 3: 在 media.js 顶部新增目标状态与加载函数**

在 `let uploadQueue = [];` 之后加：

```js
let uploadTargetCache = { devices: [], folders: [] };

async function loadUploadTargetOptions() {
  const [devRes, folderRes] = await Promise.all([
    requestJSON('/api/devices'),
    requestJSON('/api/media/folders'),
  ]);
  uploadTargetCache.devices = Array.isArray(devRes) ? devRes : (devRes?.items || devRes?.devices || []);
  uploadTargetCache.folders = folderRes?.folders || [];

  const deviceSel = document.getElementById('upload-device-select');
  if (deviceSel) {
    deviceSel.innerHTML = '<option value="">（不指定设备）</option>' +
      uploadTargetCache.devices
        .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
        .join('');
  }
  const folderSel = document.getElementById('upload-existing-folder');
  if (folderSel) {
    const opts = [];
    for (const y of uploadTargetCache.folders) {
      for (const ev of y.events) {
        const rel = `media/${y.year}/${ev}`;
        opts.push(`<option value="${escapeHtml(rel)}">${y.year} / ${escapeHtml(ev)}</option>`);
      }
    }
    folderSel.innerHTML = opts.length ? opts.join('') : '<option value="">（暂无已有文件夹）</option>';
  }
}

function readUploadTarget() {
  const modeEl = document.querySelector('input[name="upload-target-mode"]:checked');
  const mode = modeEl?.value === 'existing' ? 'existing' : 'new';
  const deviceId = document.getElementById('upload-device-select')?.value || '';
  const deviceName = uploadTargetCache.devices.find((d) => d.id === deviceId)?.name || '';
  if (mode === 'existing') {
    return { mode, existingPath: document.getElementById('upload-existing-folder')?.value || '', deviceId, deviceName };
  }
  const date = document.getElementById('upload-event-date')?.value || '';
  const eventName = document.getElementById('upload-event-name')?.value || '';
  return { mode, date, eventName, deviceId, deviceName };
}
```

- [ ] **Step 4: 在 openUploadDialog 里加载选项并设置默认日期**

把现有 `openUploadDialog` 替换为：

```js
export function openUploadDialog() {
  const overlay = document.getElementById('upload-overlay');
  if (!overlay) return;
  clearUploadQueue();
  renderUploadQueue();
  resetUploadProgress();
  // 默认今天
  const dateInput = document.getElementById('upload-event-date');
  if (dateInput && !dateInput.value) {
    const d = new Date();
    dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  updateFolderPreview();
  loadUploadTargetOptions().catch(() => { /* Toast 在调用方处理 */ });
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function updateFolderPreview() {
  const preview = document.getElementById('upload-folder-preview');
  if (!preview) return;
  const t = readUploadTarget();
  if (t.mode === 'existing') {
    preview.textContent = t.existingPath ? `目标：${t.existingPath}/<设备>` : '请选择已有文件夹';
  } else {
    const digits = (t.date || '').replace(/\D+/g, '').slice(0, 8);
    const year = digits.slice(0, 4);
    const ev = (t.eventName || '').replace(/[\\/:*?"<>|]/g, '').trim();
    preview.textContent = digits
      ? `将创建：media/${year}/${digits}${ev}/<设备>`
      : '请填写日期和活动名';
  }
}
```

- [ ] **Step 5: 在 initUploadDialog 里绑定目标切换与预览**

在 `initUploadDialog` 函数内（`const dropzone = ...` 之后）加：

```js
  const targetRadios = overlay.querySelectorAll('input[name="upload-target-mode"]');
  targetRadios.forEach((r) => r.addEventListener('change', () => {
    const newBox = document.getElementById('upload-target-new');
    const existBox = document.getElementById('upload-target-existing');
    const isExisting = document.querySelector('input[name="upload-target-mode"]:checked')?.value === 'existing';
    if (newBox) newBox.hidden = isExisting;
    if (existBox) existBox.hidden = !isExisting;
    updateFolderPreview();
  }));
  document.getElementById('upload-event-date')?.addEventListener('input', updateFolderPreview);
  document.getElementById('upload-event-name')?.addEventListener('input', updateFolderPreview);
  document.getElementById('upload-existing-folder')?.addEventListener('change', updateFolderPreview);
  document.getElementById('upload-device-select')?.addEventListener('change', updateFolderPreview);
```

- [ ] **Step 6: 重写 doUpload 为并发分批 + 目标字段**

把现有 `async function doUpload()` 整体替换为：

```js
function buildBatchFormData(batch, target) {
  const fd = new FormData();
  for (const item of batch) fd.append('files', item.file);
  fd.append('mode', target.mode);
  if (target.mode === 'existing') {
    fd.append('existingPath', target.existingPath);
  } else {
    fd.append('date', target.date);
    fd.append('eventName', target.eventName);
  }
  fd.append('deviceId', target.deviceId);
  fd.append('deviceName', target.deviceName);
  return fd;
}

async function uploadOneBatch(batch, target, onProgress) {
  const csrfToken = readCookie('ss_csrf');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/media/upload');
  if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) onProgress(e.loaded, e.total);
  });
  return new Promise((resolve, reject) => {
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `上传失败 (${xhr.status})`));
      } catch {
        reject(new Error('解析服务器响应失败'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
    xhr.send(buildBatchFormData(batch, target));
  });
}

async function doUpload() {
  if (uploadQueue.length === 0) return;
  const target = readUploadTarget();
  if (target.mode === 'new' && (!target.date || !target.eventName)) {
    Toast.error('请填写日期和活动名');
    return;
  }
  if (target.mode === 'existing' && !target.existingPath) {
    Toast.error('请选择已有文件夹');
    return;
  }

  const progress = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  const confirmBtn = document.getElementById('upload-confirm-btn');
  const cancelBtn = document.getElementById('upload-cancel-btn');
  if (progress) progress.hidden = false;
  if (confirmBtn) confirmBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  const batchSize = Math.max(1, Number(window.shengshengConfig?.UPLOAD_BATCH_SIZE) || 20);
  const concurrency = Math.max(1, Number(window.shengshengConfig?.TRANSFER_CONCURRENCY) || 4);
  const batches = [];
  for (let i = 0; i < uploadQueue.length; i += batchSize) {
    batches.push(uploadQueue.slice(i, i + batchSize));
  }

  let done = 0;
  const total = uploadQueue.length;
  const uploadedItems = [];
  const failed = [];
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const myIdx = idx++;
      const batch = batches[myIdx];
      try {
        const result = await uploadOneBatch(batch, target, () => {});
        const items = Array.isArray(result.items) ? result.items : [];
        uploadedItems.push(...items);
        done += batch.length;
        if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
        if (text) text.textContent = `上传中... ${done}/${total}`;
      } catch (error) {
        failed.push(...batch);
        done += batch.length;
        if (text) text.textContent = `上传中... ${done}/${total}（部分失败）`;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

    if (uploadedItems.length > 0) {
      if (!state.bootstrap) state.bootstrap = {};
      if (!state.bootstrap.media) state.bootstrap.media = [];
      state.bootstrap.media = [...uploadedItems, ...state.bootstrap.media];
      addLocalActivity('素材上传', `上传了 ${uploadedItems.length} 个素材`);
    }

    if (failed.length === 0) {
      Toast.success(canReviewMedia() ? `成功上传 ${uploadedItems.length} 个素材` : `成功上传 ${uploadedItems.length} 个素材，等待审核`);
      closeUploadDialog();
    } else {
      Toast.warning(`${uploadedItems.length} 成功，${failed.length} 失败`);
    }
    renderMedia();
    renderReview();
    // 后台传输可能仍在进行，轮询传输态更新徽标
    pollTransferStates(uploadedItems.map((i) => i.id));
  } catch (error) {
    Toast.error(error.message || '上传失败');
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (progress) progress.hidden = true;
  }
}

function pollTransferStates(ids) {
  if (!ids.length) return;
  let attempts = 0;
  const maxAttempts = 60; // 最长 ~2 分钟
  const tick = async () => {
    attempts++;
    try {
      const res = await requestJSON(`/api/media/transfer-states?ids=${encodeURIComponent(ids.join(','))}`);
      const states = res.states || {};
      const pending = ids.filter((id) => ['staging', 'transferring'].includes(states[id]));
      renderMedia(); // 刷新徽标
      if (pending.length && attempts < maxAttempts) {
        setTimeout(tick, 2000);
      }
    } catch {
      /* 静默 */
    }
  };
  setTimeout(tick, 2000);
}
```

- [ ] **Step 7: 在素材卡片渲染传输态徽标**

在 `renderMedia` 的 `<span class="status-pill ...">` 之后（`media-topline` 内）追加：

```js
                  ${item.transferState && item.transferState !== 'ready' ? `<span class="transfer-badge transfer-badge--${escapeHtml(item.transferState)}">${item.transferState === 'staging' ? '传输中' : item.transferState === 'transferring' ? '传输中' : item.transferState === 'failed' ? '传输失败' : item.transferState}</span>` : ''}
```

- [ ] **Step 8: 浏览器手测**

Run: `npm run dev`，登录后打开上传对话框，验证：模式切换、设备下拉加载、文件夹预览随输入更新、日期默认今天。

- [ ] **Step 9: 提交**

```bash
git add public/index.html public/js/core/dom.js public/js/modules/media.js
git commit -m "feat(media): upload dialog with target picker + device + concurrent batch upload"
```

---

### Task 10: 前端 — 查重组件

**Files:**
- Modify: `public/templates/media-library.html`
- Modify: `public/js/modules/media.js`
- Modify: `public/js/core/events.js`

- [ ] **Step 1: 在 media-library.html 工具栏之后插入查重组件**

在 `</section>`（工具栏结束）与 `<div class="media-grid" id="media-grid">` 之间插入：

```html
  <section class="dedup-panel" id="dedup-panel" aria-label="素材查重">
    <div class="dedup-head">
      <h3>素材查重</h3>
      <div class="dedup-actions">
        <button class="primary-btn" id="dedup-scan-btn" type="button">查重</button>
        <button class="ghost-btn" id="dedup-refresh-btn" type="button" aria-label="刷新查重结果">刷新</button>
      </div>
    </div>
    <small class="dedup-progress" id="dedup-progress" hidden></small>
    <div class="dedup-groups" id="dedup-groups"></div>
  </section>
```

- [ ] **Step 2: 在 media.js 追加查重函数**

在文件末尾（`initUploadDialog` 之后）追加：

```js
/* ======== 查重 ======== */

export async function runDedupScan() {
  const btn = document.getElementById('dedup-scan-btn');
  const progress = document.getElementById('dedup-progress');
  if (btn) btn.disabled = true;
  if (progress) { progress.hidden = false; progress.textContent = '正在计算哈希…'; }
  try {
    setPending(true);
    const res = await requestJSON('/api/media/dedup/scan', { method: 'POST' });
    if (progress) progress.textContent = `已计算 ${res.hashed} 个，剩余 ${res.remaining} 个未哈希；发现 ${res.groups} 组重复。`;
    await renderDedupGroups();
  } catch (error) {
    Toast.error(error.message || '查重失败');
  } finally {
    setPending(false);
    if (btn) btn.disabled = false;
  }
}

export async function renderDedupGroups() {
  const container = document.getElementById('dedup-groups');
  const progress = document.getElementById('dedup-progress');
  if (!container) return;
  try {
    const res = await requestJSON('/api/media/dedup/groups');
    if (progress) {
      progress.hidden = false;
      progress.textContent = res.unhashed > 0 ? `仍有 ${res.unhashed} 个素材未计算哈希（后台空闲时自动补算，或点“查重”）。` : `全部素材已计算哈希。`;
    }
    const groups = res.groups || [];
    container.innerHTML = groups.length
      ? groups.map((g, gi) => `
        <div class="dedup-group" data-dedup-group="${gi}">
          <div class="dedup-group-head"><strong>${g.count} 个重复</strong> <small>哈希 ${escapeHtml(g.hash.slice(0, 12))}…</small></div>
          <ul class="dedup-group-list">
            ${g.items.map((it) => `
              <li>
                <span class="dedup-item-title">${escapeHtml(it.title || '未命名')}</span>
                <small>${escapeHtml(it.source || '')}</small>
                ${isAdminUser() ? `<button class="ghost-btn dedup-keep-btn" data-dedup-keep="${escapeHtml(it.id)}" type="button">保留此个</button>` : ''}
                ${isAdminUser() ? `<button class="ghost-btn dedup-del-btn" data-dedup-delete="${escapeHtml(it.id)}" type="button">删除</button>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>`).join('')
      : '<div class="empty-state">没有发现重复素材。</div>';
  } catch (error) {
    container.innerHTML = `<div class="empty-state">查重结果加载失败：${escapeHtml(error.message || '')}</div>`;
  }
}

export function initDedup() {
  const panel = document.getElementById('dedup-panel');
  if (!panel) return;
  document.getElementById('dedup-scan-btn')?.addEventListener('click', runDedupScan);
  document.getElementById('dedup-refresh-btn')?.addEventListener('click', renderDedupGroups);
  panel.addEventListener('click', async (e) => {
    const keepBtn = e.target.closest('[data-dedup-keep]');
    const delBtn = e.target.closest('[data-dedup-delete]');
    if (delBtn) {
      if (!confirm('确定删除该重复素材？文件也会被清理。')) return;
      try {
        setPending(true);
        await requestJSON(`/api/media/${delBtn.dataset.dedupDelete}`, { method: 'DELETE' });
        if (state.bootstrap?.media) {
          state.bootstrap.media = state.bootstrap.media.filter((m) => m.id !== delBtn.dataset.dedupDelete);
        }
        Toast.success('已删除');
        await renderDedupGroups();
        renderMedia();
      } catch (error) {
        Toast.error(error.message || '删除失败');
      } finally {
        setPending(false);
      }
    }
    if (keepBtn) {
      // 保留 = 仅高亮提示用户保留此个；实际不调用后端
      Toast.info('已标记保留此个，请删除组内其它项');
    }
  });
  // 进入素材库视图时若已有结果则不自动加载，避免每次切视图都请求
  renderDedupGroups().catch(() => {});
}
```

- [ ] **Step 3: 在 events.js 导入并调用 initDedup**

在 `core/events.js` 顶部 `import { ... } from '../proxies.js'` 的解构里已有 `initUploadDialog` 等；在该解构中追加 `initDedup`（若 proxies 未转发则补 proxies.js——见 Step 4）。在 `bindMediaEvents` 内 `initUploadDialog();` 之后加：

```js
  initDedup();
```

- [ ] **Step 4: 在 proxies.js 转发 initDedup**

在 `public/js/core/proxies.js` 已有 `export const initUploadDialog = ...` 附近加：

```js
export const initDedup = (...args) => m()?.media?.initDedup?.(...args);
export const runDedupScan = (...args) => m()?.media?.runDedupScan?.(...args);
export const renderDedupGroups = (...args) => m()?.media?.renderDedupGroups?.(...args);
```

- [ ] **Step 5: 浏览器手测**

Run: `npm run dev`，进入素材库，点"查重"按钮，验证进度文本与分组列表渲染；admin 账号下验证删除按钮。

- [ ] **Step 6: 提交**

```bash
git add public/templates/media-library.html public/js/modules/media.js public/js/core/events.js public/js/core/proxies.js
git commit -m "feat(media): add dedup component with scan + groups + delete"
```

---

### Task 11: 样式

**Files:**
- Modify: `public/css/components/media.css`
- Modify: `public/css/pages/media-library.css`

- [ ] **Step 1: 在 `components/media.css` 末尾追加上传目标选择区与传输徽标样式**

```css
/* 上传目标选择区 */
.upload-target {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3, 12px);
  margin-bottom: var(--spacing-3, 12px);
  padding: var(--spacing-3, 12px);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  background: var(--surface-muted, #f8fafc);
}
.upload-target-mode { display: flex; gap: var(--spacing-2, 8px); flex-basis: 100%; }
.radio-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 999px; cursor: pointer; min-height: 44px;
}
.upload-folder-preview { flex-basis: 100%; color: var(--text-muted, #64748b); }

/* 传输态徽标 */
.transfer-badge {
  font-size: 12px; padding: 2px 8px; border-radius: 999px; margin-left: 6px;
}
.transfer-badge--staging, .transfer-badge--transferring { background: #fef3c7; color: #92400e; }
.transfer-badge--failed { background: #fee2e2; color: #b91c1c; }
```

- [ ] **Step 2: 在 `pages/media-library.css` 末尾追加查重组件样式**

```css
/* 查重组件 */
.dedup-panel {
  margin: var(--spacing-3, 12px) 0;
  padding: var(--spacing-3, 12px);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
}
.dedup-head { display: flex; justify-content: space-between; align-items: center; }
.dedup-actions { display: flex; gap: var(--spacing-2, 8px); }
.dedup-progress { display: block; margin: var(--spacing-2, 8px) 0; color: var(--text-muted, #64748b); }
.dedup-group {
  margin-top: var(--spacing-3, 12px); padding: var(--spacing-2, 8px);
  border-left: 3px solid var(--accent, #1f5a49);
  background: var(--surface-muted, #f8fafc); border-radius: 4px;
}
.dedup-group-head { display: flex; gap: var(--spacing-2, 8px); align-items: baseline; }
.dedup-group-list { list-style: none; padding: 0; margin: var(--spacing-2, 8px) 0 0; }
.dedup-group-list li {
  display: flex; align-items: center; gap: var(--spacing-2, 8px);
  padding: 6px 0; border-bottom: 1px dashed var(--border-color, #e2e8f0);
}
.dedup-item-title { font-weight: 600; }
.dedup-group-list small { color: var(--text-muted, #64748b); }
.dedup-del-btn { color: #b91c1c; }
```

- [ ] **Step 3: 触控目标与可访问性自查**

确认 `.radio-chip`、`.dedup-scan-btn`、`.dedup-del-btn` 等可点击元素 min-height ≥ 44px（上面 `.radio-chip` 已设；按钮复用全局 `.primary-btn`/`.ghost-btn`，确认其 min-height ≥ 44px，否则在本文件补 `min-height: 44px;`）。

- [ ] **Step 4: 提交**

```bash
git add public/css/components/media.css public/css/pages/media-library.css
git commit -m "style(media): upload target picker, transfer badges, dedup component"
```

---

### Task 12: 文档 + lint + 端到端手测

**Files:**
- Modify: `docs/GUIDE.md`

- [ ] **Step 1: 更新 GUIDE.md API 参考**

在素材库 API 段追加（若该文件有 `## API` / 素材库小节则并入；否则在合适位置新增）：

```markdown
### 素材库上传与查重

- `POST /api/media/upload` — 分批暂存上传。表单字段：`files`（多文件）、`mode`（`new`/`existing`）、`date`、`eventName`、`existingPath`、`deviceId`、`deviceName`。返回 `{ ok, items, jobId }`。文件先落暂存区，后台传到 `media/{年}/{YYYYMMDD活动名}/{设备名}/`，记录 `transfer_state=staging`，传输完成置 `ready`。
- `GET /api/media/transfer-states?ids=a,b` — 批量查传输态。
- `GET /api/media/folders` — 已有 `年/活动` 文件夹列表。
- `POST /api/media/dedup/scan` — 触发未哈希素材的 SHA-256 计算并返回重复组数。
- `GET /api/media/dedup/groups` — 重复分组（同 `file_hash`），含每组成员。
```

- [ ] **Step 2: 运行 lint 与测试**

Run: `npm run lint && npm test`
Expected: lint 无 error；测试全过。

- [ ] **Step 3: 端到端手测（对照验收标准）**

Run: `npm run dev`，逐项验证：
1. 上传对话框：选"新建"+日期+活动名+设备，拖入 >20 个文件，前端分批并发上传，进度可见，无数量上限报错。
2. 检查 `UPLOAD_DIR/media/2026/20260622<活动>/<设备>/` 下文件已生成（本机存储走 fs 拷贝）。
3. 若配置了 UNC 路径（`.env` 的 `UPLOAD_DIR=\\host\share\...`），验证日志走 robocopy 且文件到位。
4. 上传中断服务（Ctrl+C）后重启，原 `staging/transferring` 记录恢复为 `ready` 或 `failed`。
5. 点"查重"按钮，全库算哈希，重复分组列表正确；admin 删除一个重复项，文件与记录均清除。
6. 等待 `AUTO_SCAN_SECONDS` 后或重启，未哈希素材被后台渐进补算哈希。
7. 权限：非 editor/admin 不能上传/查重删除；UI 触控目标 ≥ 44px、键盘焦点可见、图标按钮有 aria-label。

- [ ] **Step 4: 提交**

```bash
git add docs/GUIDE.md
git commit -m "docs(media): document bulk upload, transfer, and dedup endpoints"
```

---

## 自检（写完后通读）

- **Spec 覆盖**：设计 10 节均有对应任务——目录模型(Task7/9)、分阶段上传(Task7/9)、数据模型(Task4/5)、查重(Task5/7/8/10)、前端(Task9/10/11)、后端模块(Task5/6/7/8)、边界(各 Task 内)、YAGNI(未引入 tus/跨根)、验收(Task12 Step3)。✅
- **占位符扫描**：无 TBD/TODO；每个代码步均含完整代码。✅
- **类型一致**：`transfer_state` 取值、`file_hash`、`original_filename`、各函数名在 Task5/6/7/9/10 间一致；`readUploadTarget` 返回字段与 `buildBatchFormData` 消费字段一致（mode/existingPath/date/eventName/deviceId/deviceName）。✅
- **遗留注意**：Task6 `retryJob` 为占位实现（仅重置进度），完整重试需路由层从 DB 取 failed 记录再 enqueue——已在该函数注释说明，超出当前最小可用范围，记为后续增强，不影响验收项 1-7。✅
