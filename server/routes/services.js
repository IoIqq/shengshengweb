/**
 * Windows 服务管理路由
 *
 * 通过 sc 命令列出/启停系统服务。启停需提权，
 * 非提权 Node 进程会收到错误，端点优雅返回。
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { audit: auditModel } = require('../models');
const { runCommand } = require('../utils/exec');

// GET /api/services/list
// 仅返回服务器 / NAS 相关服务，不暴露无关系统服务
const SERVER_NAS_RE = /^(W3SVC|WAS|IISADMIN|WMSVC|W3Logsvc|Apache.*|nginx.*|httpd.*|MSSQL.*|SQLAgent.*|SQLBrowser|SQLTELEMETRY|MySQL.*|MariaDB.*|PostgreSQL.*|MongoDB.*|Redis.*|PM2.*|node.*|LanmanServer|LanmanWorkstation|Browser|NfsSvc|NfsClient.*|Dhcp|DhcpServer|Dnscache|DNS|sshd|OpenSSH.*|SshBroker|SshProxy|TermService|SessionEnv|UmRdpService|VSS|VDS|wbengine|SDRSVC|swprv|FTPSVC|MSFTPSVC|.*FTP.*|W32Time|NetLogon|Synology.*|QNAP.*|TrueNAS.*|Minio.*|EventLog|SamSs|Winmgmt)$/i;
router.get('/list', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.platform !== 'win32') {
      return res.json({ ok: true, services: [], note: '仅支持 Windows 服务管理。' });
    }
    // 用 PowerShell Get-CimInstance 获取服务字段（wmic 在新版 Windows 11 已移除）
    let services = [];
    try {
      const { stdout } = await runCommand('powershell', ['-NoProfile', '-Command',
        '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Service | Select-Object Name,DisplayName,State,StartMode | ConvertTo-Json -Compress)',
      ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
      let raw;
      try { raw = JSON.parse(stdout.trim()); } catch (_) { raw = []; }
      const rows = Array.isArray(raw) ? raw : [raw];
      for (const row of rows) {
        if (!row.Name) continue;
        services.push({
          name: row.Name,
          displayName: row.DisplayName || row.Name,
          state: row.State || 'UNKNOWN',
          startType: row.StartMode || '',
        });
      }
    } catch (e) {
      return res.status(500).json({ error: '读取服务列表失败：' + (e.message || '') });
    }
    // 只保留服务器 / NAS 相关服务
    services = services.filter(s => SERVER_NAS_RE.test(s.name));
    // 运行中优先排序
    services.sort((a, b) => {
      if (a.state !== b.state) return a.state === 'Running' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, 'zh-CN');
    });
    res.json({ ok: true, services });
  } catch (error) {
    res.status(500).json({ error: '获取服务列表失败。' });
  }
});

async function scAction(name, action) {
  // sc.exe 用退出码 + 文本双重表达失败；ignoreExitCode 让我们自行判定，避免一律 500
  const { stdout, stderr, code } = await runCommand('sc.exe', [action, name], { timeout: 30000, ignoreExitCode: true });
  const out = (stdout + stderr).trim();
  // 退出码非 0 即失败；再按文本兜底（中文 sc 失败含"失败"/"拒绝访问"，英文含 FAILED/Access is denied）
  const failed = code !== 0 || /失败|FAILED|错误|拒绝访问|Access is denied|未安装|not exist/i.test(out);
  const accessDenied = code === 5 || /拒绝访问|Access is denied/i.test(out);
  return { output: out, failed, accessDenied };
}

// POST /api/services/:name/start
router.post('/:name/start', requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[A-Za-z0-9_.\-]+$/.test(name)) return res.status(400).json({ error: '服务名不合法。' });
  try {
    const { output, failed, accessDenied } = await scAction(name, 'start');
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'service_start', resourceType: 'service', resourceId: name, ipAddress: req.ip, userAgent: req.get('user-agent') });
    if (failed) return res.status(accessDenied ? 403 : 400).json({ error: (accessDenied ? '启动失败：可能需要管理员权限。' : '启动失败：') + output.slice(0, 200) });
    res.json({ ok: true, message: output.slice(0, 200) });
  } catch (error) {
    res.status(500).json({ error: '启动服务失败：' + (error.message || '') });
  }
});

// POST /api/services/:name/stop
router.post('/:name/stop', requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[A-Za-z0-9_.\-]+$/.test(name)) return res.status(400).json({ error: '服务名不合法。' });
  try {
    const { output, failed, accessDenied } = await scAction(name, 'stop');
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'service_stop', resourceType: 'service', resourceId: name, ipAddress: req.ip, userAgent: req.get('user-agent') });
    if (failed) return res.status(accessDenied ? 403 : 400).json({ error: (accessDenied ? '停止失败：可能需要管理员权限。' : '停止失败：') + output.slice(0, 200) });
    res.json({ ok: true, message: output.slice(0, 200) });
  } catch (error) {
    res.status(500).json({ error: '停止服务失败：' + (error.message || '') });
  }
});

// POST /api/services/:name/restart
router.post('/:name/restart', requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[A-Za-z0-9_.\-]+$/.test(name)) return res.status(400).json({ error: '服务名不合法。' });
  try {
    await scAction(name, 'stop').catch(() => {});
    // 等待 1 秒再启动
    await new Promise((r) => setTimeout(r, 1000));
    const { output, failed, accessDenied } = await scAction(name, 'start');
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'service_restart', resourceType: 'service', resourceId: name, ipAddress: req.ip, userAgent: req.get('user-agent') });
    if (failed) return res.status(accessDenied ? 403 : 400).json({ error: (accessDenied ? '重启失败：可能需要管理员权限。' : '重启失败：') + output.slice(0, 200) });
    res.json({ ok: true, message: output.slice(0, 200) });
  } catch (error) {
    res.status(500).json({ error: '重启服务失败：' + (error.message || '') });
  }
});

module.exports = router;
