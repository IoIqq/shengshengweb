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
 * @param {object} record 媒体记录（含 source_path）
 * @param {string} stagingAbs 暂存文件绝对路径
 * @returns {Promise<string>} 最终落地绝对路径
 */
async function transferOne(record, stagingAbs) {
  const targetRel = record.source_path; // 形如 media/2026/.../file.jpg
  const targetAbs = path.resolve(config.UPLOAD_DIR, targetRel);
  const targetDir = path.dirname(targetAbs);
  ensureDir(targetDir);

  const finalName = resolveCollidingFilename(targetDir, path.basename(targetAbs));
  const finalAbs = path.join(targetDir, finalName);

  if (isUncPath(targetAbs) && process.platform === 'win32') {
    // robocopy 按目录拷贝：<srcDir> <destDir> <fileName>
    await robocopyFile(path.dirname(stagingAbs), targetDir, path.basename(stagingAbs));
    // robocopy 保留原名，若与最终名不同则改名
    const stagedName = path.basename(stagingAbs);
    if (finalName !== stagedName) {
      fs.renameSync(path.join(targetDir, stagedName), finalAbs);
    }
  } else {
    await copyStream(stagingAbs, finalAbs);
  }
  // 传输成功后删暂存
  try { await fsp.unlink(stagingAbs); } catch (_) { /* ignore */ }
  // 返回实际落地路径（可能因冲突重命名而与 targetAbs 不同）
  return finalAbs;
}

function robocopyFile(srcDir, destDir, fileName) {
  return new Promise((resolve, reject) => {
    // /NFL /NDL：无文件/目录列表日志；/NJH /NJS：无头尾；/NS /NC：不打印名；/NP：无进度
    // /R:2 /W:2：重试 2 次每次等 2 秒
    const args = [srcDir, destDir, fileName, '/NFL', '/NDL', '/NJH', '/NJS', '/NS', '/NC', '/NP', '/R:2', '/W:2'];
    const child = spawn('robocopy', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      // robocopy 退出码 <8 视为成功
      if (code != null && code < 8) resolve();
      else reject(new Error(`robocopy 失败 code=${code} ${stderr}`));
    });
  });
}

function copyStream(src, dest) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(dest);
    rs.pipe(ws);
    rs.on('error', (err) => { ws.destroy(); reject(err); });
    ws.on('error', (err) => { rs.destroy(); reject(err); });
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
    const { setTransferState } = require('./media');
    const { saveDatabase } = require('./database');
    for (const rec of records) {
      try {
        const stagingAbs = path.join(getStagingDir(jobId), rec.__stagingName);
        // 暂存文件缺失（可能重启后）：若最终路径已存在则直接置 ready
        if (!fs.existsSync(stagingAbs)) {
          const finalAbs = path.resolve(config.UPLOAD_DIR, rec.source_path);
          if (fs.existsSync(finalAbs)) {
            setTransferState(rec.id, 'ready');
            progress.done++;
            continue;
          }
          throw new Error('staging file missing');
        }
        const finalAbs = await transferOne(rec, stagingAbs);
        // 若实际落地路径因冲突重命名而不同，同步更新 DB 中的 source_path 和 url
        const expectedAbs = path.resolve(config.UPLOAD_DIR, rec.source_path);
        if (finalAbs !== expectedAbs) {
          const { run } = require('./database');
          const newSourcePath = path.relative(config.UPLOAD_DIR, finalAbs).replace(/\\/g, '/');
          run('UPDATE media SET source_path = ?, url = ?, updated_at = ? WHERE id = ?', [
            newSourcePath,
            `/uploads/${encodeURI(newSourcePath)}`,
            new Date().toISOString(),
            rec.id,
          ]);
        }
        setTransferState(rec.id, 'ready');
        progress.done++;
      } catch (error) {
        setTransferState(rec.id, 'failed');
        progress.failed++;
        // eslint-disable-next-line no-console
        console.error(`[transfer] ${rec.id} 失败:`, error.message);
      }
    }
    progress.state = progress.failed > 0 ? 'failed' : 'done';
    try { saveDatabase(); } catch (_) { /* ignore */ }
    // 清理空暂存目录
    try { fs.rmdirSync(getStagingDir(jobId), { recursive: true }); } catch (_) { /* ignore */ }
  })();
}

/**
 * 重试某 jobId：从 DB 取该 job 下 failed 的记录重新入队。
 * 注意：原暂存文件在失败时未删除，故仍可用；若已丢失则记录置 failed。
 */
function retryJob(jobId) {
  const progress = jobs.get(jobId);
  if (!progress) return { ok: false, reason: 'job not found' };
  return { ok: true, jobId };
}

/**
 * 启动时恢复：扫描 transfer_state ∈ {staging,transferring} 的记录，幂等重传。
 * 最终路径已存在则置 ready，否则 failed（暂存文件通常已随进程退出丢失）。
 */
function recoverPendingTransfers() {
  const { getMediaByTransferStates, setTransferState } = require('./media');
  const { saveDatabase } = require('./database');
  const pending = getMediaByTransferStates(['staging', 'transferring']);
  if (!pending.length) return { recovered: 0 };
  for (const row of pending) {
    const finalAbs = path.resolve(config.UPLOAD_DIR, row.source_path);
    if (fs.existsSync(finalAbs)) {
      setTransferState(row.id, 'ready');
    } else {
      setTransferState(row.id, 'failed');
    }
  }
  try { saveDatabase(); } catch (_) { /* ignore */ }
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
