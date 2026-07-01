/**
 * 磁盘+资源监控路由
 *
 * 物理磁盘信息走 PowerShell Get-CimInstance（Windows），容量走 fs.statfsSync，
 * CPU/内存实时值走 os 模块，历史数据用内存环形缓冲（每 5s 采样）。
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { runCommand } = require('../utils/exec');

// ========== 历史采样缓冲 ==========
const HISTORY_MAX = 720; // 5s × 720 = 1 小时
const history = { cpu: [], mem: [], timestamps: [] };
let lastCpuTimes = null;

function sampleMetrics() {
  try {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const c of cpus) {
      const t = c.times;
      const tick = t.user + t.nice + t.sys + t.irq + t.idle;
      totalTick += tick;
      totalIdle += t.idle;
    }
    let cpuPct = 0;
    if (lastCpuTimes) {
      const dTick = totalTick - lastCpuTimes.totalTick;
      const dIdle = totalIdle - lastCpuTimes.totalIdle;
      cpuPct = dTick > 0 ? Math.round((1 - dIdle / dTick) * 1000) / 10 : 0;
    }
    lastCpuTimes = { totalTick, totalIdle };

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memPct = Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10;

    history.cpu.push(cpuPct);
    history.mem.push(memPct);
    history.timestamps.push(Date.now());
    if (history.cpu.length > HISTORY_MAX) {
      history.cpu.shift();
      history.mem.shift();
      history.timestamps.shift();
    }
  } catch (_) {}
}

// 启动采样器（unref，不阻止退出）
setInterval(sampleMetrics, 5000).unref();
sampleMetrics();

// ========== 磁盘详情 ==========
// GET /api/monitor/disks
router.get('/disks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const disks = [];
    if (process.platform === 'win32') {
      try {
        // 用 PowerShell 替代 wmic（wmic 在新版 Windows 11 已移除）
        const { stdout } = await runCommand('powershell', ['-NoProfile', '-Command',
          '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_DiskDrive | Select-Object Model,SerialNumber,Size,MediaType,Status,Index | ConvertTo-Json -Compress)',
        ], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
        let raw;
        try { raw = JSON.parse(stdout.trim()); } catch (_) { raw = []; }
        const rows = Array.isArray(raw) ? raw : [raw];
        for (const row of rows) {
          const size = Number(row.Size);
          disks.push({
            model: row.Model || '未知',
            serial: row.SerialNumber || '',
            sizeBytes: size || null,
            sizeText: size ? formatBytes(size) : null,
            mediaType: row.MediaType || '',
            status: row.Status || '',
            index: Number(row.Index) || 0,
          });
        }
      } catch (e) {
        // PowerShell 不可用时降级为空（盘符容量仍由 fs.statfsSync 提供）
      }
    }

    // 盘符容量（复用 storage.js 模式）
    const volumes = [];
    if (process.platform === 'win32') {
      for (let code = 65; code <= 90; code++) {
        const root = `${String.fromCharCode(code)}:\\`;
        if (fs.existsSync(root) && typeof fs.statfsSync === 'function') {
          try {
            const s = fs.statfsSync(root);
            const bs = Number(s.bsize || s.frsize || 0);
            const total = Number(s.blocks || 0) * bs;
            const free = Number(s.bavail || s.bfree || 0) * bs;
            if (total > 0) {
              volumes.push({
                root: `${String.fromCharCode(code)}:/`,
                totalBytes: total, freeBytes: free,
                usedBytes: Math.max(0, total - free),
                usedPercent: Math.round((Math.max(0, total - free) / total) * 1000) / 10,
                totalText: formatBytes(total),
                usedText: formatBytes(Math.max(0, total - free)),
                freeText: formatBytes(free),
              });
            }
          } catch (_) {}
        }
      }
    }

    res.json({ ok: true, disks, volumes });
  } catch (error) {
    res.status(500).json({ error: '获取磁盘信息失败。' });
  }
});

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  if (bytes < 1024 ** 4) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  return (bytes / 1024 ** 4).toFixed(2) + ' TB';
}

// ========== 实时资源 ==========
// GET /api/monitor/resources
router.get('/resources', requireAuth, requireAdmin, (req, res) => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const procMem = process.memoryUsage();
    res.json({
      ok: true,
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || '',
        speedMhz: cpus[0]?.speed || 0,
        usage: history.cpu[history.cpu.length - 1] || 0,
        loadAvg: os.loadavg(),
      },
      memory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: totalMem - freeMem,
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
        totalText: formatBytes(totalMem),
        usedText: formatBytes(totalMem - freeMem),
        freeText: formatBytes(freeMem),
      },
      process: {
        rss: formatBytes(procMem.rss),
        heapUsed: formatBytes(procMem.heapUsed),
        heapTotal: formatBytes(procMem.heapTotal),
      },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
    });
  } catch (error) {
    res.status(500).json({ error: '获取资源信息失败。' });
  }
});

// ========== 历史曲线 ==========
// GET /api/monitor/history
router.get('/history', requireAuth, requireAdmin, (req, res) => {
  res.json({
    ok: true,
    cpu: history.cpu,
    mem: history.mem,
    timestamps: history.timestamps,
    interval: 5,
  });
});

module.exports = router;
