/**
 * 主机电源 + 网络管理路由
 *
 * 关机/重启走 shutdown 命令（30s 延时可取消），
 * 网卡信息走 os.networkInterfaces()，防火墙规则走 netsh（只读）。
 */
const express = require('express');
const router = express.Router();
const os = require('os');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { audit: auditModel, session: sessionModel } = require('../models');
const { runCommand } = require('../utils/exec');
const config = require('../config');

// POST /api/host/shutdown — 30s 延时关机
router.post('/shutdown', requireAuth, requireAdmin, async (req, res) => {
  const delay = Math.max(0, Math.min(600, Number(req.body?.delay) || 30));
  try {
    // 等 shutdown.exe 确认接收再回复，避免命令失败却假报"已调度"
    await runCommand('shutdown.exe', ['/s', '/t', String(delay), '/c', 'NAS 管理后台触发关机'], { timeout: 10000 });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'host_shutdown', resourceType: 'host', resourceId: `${delay}s`, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, message: `系统将在 ${delay} 秒后关机。可调用取消接口中止。`, delay });
  } catch (error) {
    res.status(500).json({ error: '关机命令发送失败：' + (error.message || '') });
  }
});

// POST /api/host/reboot — 30s 延时重启
router.post('/reboot', requireAuth, requireAdmin, async (req, res) => {
  const delay = Math.max(0, Math.min(600, Number(req.body?.delay) || 30));
  try {
    await runCommand('shutdown.exe', ['/r', '/t', String(delay), '/c', 'NAS 管理后台触发重启'], { timeout: 10000 });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'host_reboot', resourceType: 'host', resourceId: `${delay}s`, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, message: `系统将在 ${delay} 秒后重启。可调用取消接口中止。`, delay });
  } catch (error) {
    res.status(500).json({ error: '重启命令发送失败：' + (error.message || '') });
  }
});

// POST /api/host/cancel-shutdown
router.post('/cancel-shutdown', requireAuth, requireAdmin, async (req, res) => {
  try {
    await runCommand('shutdown.exe', ['/a'], { timeout: 10000 });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'host_cancel_shutdown', resourceType: 'host', ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, message: '已取消关机/重启。' });
  } catch (error) {
    res.status(500).json({ error: '取消失败（可能本就没有待执行的关机）。' });
  }
});

// GET /api/host/network — 详细网卡信息
router.get('/network', requireAuth, requireAdmin, (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const list = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const a of addrs) {
        list.push({
          interface: name,
          family: a.family,
          address: a.address,
          netmask: a.netmask,
          mac: a.mac,
          internal: a.internal,
          cidr: a.cidr || null,
        });
      }
    }
    res.json({ ok: true, hostname: os.hostname(), interfaces: list });
  } catch (error) {
    res.status(500).json({ error: '获取网络信息失败。' });
  }
});

// GET /api/host/lan-clients — 局域网客户端 + 在线用户 + 活跃连接
router.get('/lan-clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    // 1. 在线用户（从 sessions 表）
    const onlineUsers = (sessionModel.listAllActiveSessions() || []).map((s) => ({
      username: s.username,
      displayName: s.display_name || s.username,
      role: s.role,
      status: s.status,
      ipAddress: s.ip_address || '',
      userAgent: s.user_agent || '',
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      token: (s.token || '').slice(0, 8),
    }));

    // 2. ARP 表（所有已知 LAN 设备）
    const arpTable = [];
    if (process.platform === 'win32') {
      try {
        const { stdout } = await runCommand('arp', ['-a'], { timeout: 8000 });
        // Windows arp -a 输出格式：
        //   接口: 192.168.1.100 --- 0xa
        //     Internet 地址         物理地址              类型
        //     192.168.1.1           aabb-ccdd-eeff        动态
        let currentInterface = '';
        for (const line of stdout.split(/\r?\n/)) {
          const ifaceMatch = line.match(/接口:\s*([\d.]+)/) || line.match(/Interface:\s*([\d.]+)/);
          if (ifaceMatch) { currentInterface = ifaceMatch[1]; continue; }
          // 匹配 "IP  MAC  类型" 行（MAC 含 - 或 :）
          const m = line.match(/^\s*([\d.]+)\s+([0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5})\s+(\S+)\s*$/);
          if (m) {
            arpTable.push({
              ip: m[1],
              mac: m[2].replace(/-/g, ':').toLowerCase(),
              type: m[4],
              interface: currentInterface,
            });
          }
        }
      } catch (_) {}
    }

    // 3. 活跃 TCP 连接到本服务端口
    const connections = [];
    if (process.platform === 'win32') {
      try {
        const port = String(config.PORT);
        const { stdout } = await runCommand('netstat', ['-ano'], { timeout: 8000, maxBuffer: 1024 * 1024 });
        for (const line of stdout.split(/\r?\n/)) {
          if (!line.includes(':' + port)) continue;
          // TCP    192.168.1.100:48080   192.168.1.50:52341    ESTABLISHED  12345
          const m = line.match(/\s*TCP\s+([\d.]+):(\d+)\s+([\d.]+):(\d+)\s+(\S+)\s+(\d+)/);
          if (m) {
            connections.push({
              localAddr: `${m[1]}:${m[2]}`,
              remoteAddr: `${m[3]}:${m[4]}`,
              state: m[5],
              pid: Number(m[6]),
            });
          }
        }
      } catch (_) {}
    }

    res.json({ ok: true, onlineUsers, arpTable, connections, serverPort: config.PORT });
  } catch (error) {
    res.status(500).json({ error: '获取局域网客户端失败。' });
  }
});

// GET /api/host/firewall — 防火墙规则（含本系统拉黑的 IP）
router.get('/firewall', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.platform !== 'win32') {
      return res.json({ ok: true, rules: [], blockedIps: [], note: '仅支持 Windows 防火墙。' });
    }
    let rules = [];
    const blockedIps = [];
    try {
      const { stdout } = await runCommand('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=all'], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
      // netsh 输出按空行分隔每条规则，字段为 "键: 值"
      const blocks = stdout.split(/\r?\n\r?\n/).filter((b) => b.trim());
      for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        const rule = {};
        for (const line of lines) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            rule[key] = val;
          }
        }
        const name = rule['规则名称'] || rule['Rule Name'] || '';
        if (name) {
          rules.push({
            name,
            enabled: rule['已启用'] || rule['Enabled'] || '',
            direction: rule['方向'] || rule['Direction'] || '',
            profile: rule['配置文件'] || rule['Profile'] || '',
            action: rule['操作'] || rule['Action'] || '',
            protocol: rule['协议'] || rule['Protocol'] || '',
            localPort: rule['本地端口'] || rule['LocalPort'] || '',
            remotePort: rule['远程端口'] || rule['RemotePort'] || '',
          });
          // 收集本系统拉黑规则对应的 IP：NAS-BLOCK-<ip>
          const m = name.match(/^NAS-BLOCK-(\d{1,3}(?:\.\d{1,3}){3})$/);
          if (m && !blockedIps.includes(m[1])) blockedIps.push(m[1]);
        }
      }
    } catch (e) {
      return res.json({ ok: true, rules: [], blockedIps: [], note: '读取防火墙规则失败：' + (e.message || '') });
    }
    res.json({ ok: true, rules, blockedIps });
  } catch (error) {
    res.status(500).json({ error: '获取防火墙信息失败。' });
  }
});

// 严格 IPv4 校验（每段 0-255），只允许合法点分十进制，防止参数注入
function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((seg) => {
    const n = Number(seg);
    return n >= 0 && n <= 255 && String(n) === String(Number(seg));
  });
}

// POST /api/host/firewall/block — 新增入站 block 规则封禁指定 IP（默认放行，可临时拉黑）
router.post('/firewall/block', requireAuth, requireAdmin, async (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ error: '仅支持 Windows 防火墙。' });
  }
  const ip = String(req.body?.ip || '').trim();
  if (!isValidIpv4(ip)) {
    return res.status(400).json({ error: 'IP 地址格式不合法。' });
  }
  try {
    // 数组式传参 + 已通过严格 IPv4 校验，规则名固定前缀便于识别与解封
    await runCommand('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=NAS-BLOCK-${ip}`, 'dir=in', 'action=block', `remoteip=${ip}`], { timeout: 15000 });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'firewall_block_ip', resourceType: 'firewall', resourceId: ip, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, message: `已拉黑 ${ip}（入站封禁）。`, ip });
  } catch (error) {
    // 权限不足时 netsh 会报错，提示需管理员权限运行
    const msg = /requires elevation|拒绝访问|access is denied/i.test(error.message || '') ? '权限不足：需以管理员身份运行本服务。' : ('拉黑失败：' + (error.message || ''));
    res.status(500).json({ error: msg });
  }
});

// POST /api/host/firewall/unblock — 删除对应 block 规则解封 IP
router.post('/firewall/unblock', requireAuth, requireAdmin, async (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ error: '仅支持 Windows 防火墙。' });
  }
  const ip = String(req.body?.ip || '').trim();
  if (!isValidIpv4(ip)) {
    return res.status(400).json({ error: 'IP 地址格式不合法。' });
  }
  try {
    await runCommand('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=NAS-BLOCK-${ip}`], { timeout: 15000 });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'firewall_unblock_ip', resourceType: 'firewall', resourceId: ip, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, message: `已解封 ${ip}。`, ip });
  } catch (error) {
    const msg = /requires elevation|拒绝访问|access is denied/i.test(error.message || '') ? '权限不足：需以管理员身份运行本服务。' : ('解封失败：' + (error.message || ''));
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
