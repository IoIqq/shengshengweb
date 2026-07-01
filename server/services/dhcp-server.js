/**
 * DHCP 服务管理器
 *
 * 封装 dhcp npm 包，提供启停、配置同步、租约追踪。
 * UDP 67 端口需管理员权限。
 */
const dhcp = require('dhcp');
const os = require('os');
const { get, all, run, saveDatabase } = require('../models/database');
const { nowIso } = require('../utils');

let serverInstance = null;
let leaseLog = []; // 最近绑定的租约记录（内存，重启丢失）

/** 获取或初始化 DHCP 配置（单行） */
function getConfig() {
  let row = get('SELECT * FROM dhcp_config WHERE id = 1');
  if (!row) {
    run(`INSERT INTO dhcp_config (id, pool_start, pool_end, netmask, gateway, dns_primary, dns_secondary, lease_hours, server_ip, enabled)
         VALUES (1, '', '', '255.255.255.0', '', '', '', 24, '', 0)`);
    saveDatabase();
    row = get('SELECT * FROM dhcp_config WHERE id = 1');
  }
  return row;
}

/** 获取所有 MAC→IP 绑定 */
function getReservations() {
  return all('SELECT mac, ip, hostname, note, created_at FROM dhcp_reservations ORDER BY ip');
}

/** 将数据库绑定转为 dhcp 库的 static 格式 { mac: ip } */
function buildStaticMap() {
  const rows = getReservations();
  const map = {};
  for (const r of rows) {
    map[r.mac.toLowerCase()] = r.ip;
  }
  return map;
}

/** 自动探测本机局域网 IP 作为 server_ip 默认值 */
function detectServerIp() {
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal && (a.address.startsWith('192.168.') || a.address.startsWith('10.') || a.address.startsWith('172.'))) {
        return a.address;
      }
    }
  }
  return '';
}

/** 启动 DHCP 服务（异步：等待 UDP 67 绑定成功才算启动，否则返回失败） */
function start() {
  if (serverInstance) return Promise.resolve({ ok: true, message: '已在运行' });

  const cfg = getConfig();
  if (!cfg.pool_start || !cfg.pool_end) {
    return Promise.reject(new Error('请先配置地址池范围'));
  }
  if (!cfg.server_ip) {
    cfg.server_ip = detectServerIp();
    run('UPDATE dhcp_config SET server_ip = ? WHERE id = 1', [cfg.server_ip]);
    saveDatabase();
  }

  const dns = [cfg.dns_primary, cfg.dns_secondary].filter(Boolean);
  const options = {
    range: [cfg.pool_start, cfg.pool_end],
    netmask: cfg.netmask,
    static: buildStaticMap(),
    leaseTime: (cfg.lease_hours || 24) * 3600,
  };
  if (cfg.gateway) options.router = cfg.gateway;
  if (dns.length) options.dns = dns;
  if (cfg.server_ip) options.server = cfg.server_ip;

  serverInstance = dhcp.createServer(options);

  // 追踪租约绑定事件
  serverInstance.on('bound', (info) => {
    try {
      const mac = (info.chaddr || '').toString('hex').match(/.{2}/g)?.join(':') || '';
      leaseLog.unshift({
        mac,
        ip: info.yiaddr || '',
        hostname: info.options?.hostname || '',
        time: nowIso(),
      });
      if (leaseLog.length > 200) leaseLog.pop();
    } catch (_) {}
  });

  // listen() 内部异步 bind，必须等 'listening' 才算成功；失败会 emit 'error'
  return new Promise((resolve, reject) => {
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { serverInstance.close(); } catch (_) {}
      serverInstance = null;
      reject(new Error('启动超时：UDP 67 绑定无响应（可能需要管理员权限）'));
    }, 5000);
    guard.unref();
    serverInstance.on('listening', () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      run('UPDATE dhcp_config SET enabled = 1 WHERE id = 1');
      saveDatabase();
      resolve({ ok: true, message: 'DHCP 服务已启动' });
    });
    serverInstance.on('error', (err) => {
      const msg = typeof err === 'string' ? err : (err?.message || String(err));
      console.error('[DHCP] 服务错误:', msg);
      if (settled) return; // 启动后的运行时错误仅记录
      settled = true;
      clearTimeout(guard);
      try { serverInstance.close(); } catch (_) {}
      serverInstance = null;
      run('UPDATE dhcp_config SET enabled = 0 WHERE id = 1');
      saveDatabase();
      reject(new Error(/EACCES|EPERM/i.test(msg) ? '启动失败：需要管理员权限绑定 UDP 67 端口' : /EADDRINUSE/i.test(msg) ? '启动失败：UDP 67 端口被占用（可能已有 DHCP 服务）' : '启动失败：' + msg));
    });
    serverInstance.listen();
  });
}

/** 停止 DHCP 服务 */
function stop() {
  if (!serverInstance) return { ok: true, message: '未在运行' };
  try { serverInstance.close(); } catch (_) {}
  serverInstance = null;
  run('UPDATE dhcp_config SET enabled = 0 WHERE id = 1');
  saveDatabase();
  return { ok: true, message: 'DHCP 服务已停止' };
}

/** 获取运行状态 + 租约 */
function getStatus() {
  const cfg = getConfig();
  const reservations = getReservations();
  const running = !!serverInstance;

  // 从 dhcp 库的 _state 提取当前租约
  let leases = [];
  if (serverInstance && serverInstance._state) {
    try {
      leases = Object.entries(serverInstance._state).map(([key, val]) => ({
        key,
        ip: val?.ip || val?.address || key,
        mac: val?.mac || val?.chaddr || '',
        expires: val?.leaseTime ? new Date(Date.now() + val.leaseTime * 1000).toISOString() : '',
        hostname: val?.hostname || '',
      }));
    } catch (_) {}
  }

  return {
    running,
    enabled: !!cfg.enabled,
    config: {
      poolStart: cfg.pool_start,
      poolEnd: cfg.pool_end,
      netmask: cfg.netmask,
      gateway: cfg.gateway,
      dnsPrimary: cfg.dns_primary,
      dnsSecondary: cfg.dns_secondary,
      leaseHours: cfg.lease_hours,
      serverIp: cfg.server_ip,
    },
    reservations,
    leases,
    recentBindings: leaseLog.slice(0, 50),
    detectedIp: detectServerIp(),
  };
}

/** 更新配置（不自动重启运行中的服务，需手动重启生效） */
function updateConfig(updates) {
  const fields = [];
  const values = [];
  const map = {
    poolStart: 'pool_start', poolEnd: 'pool_end', netmask: 'netmask',
    gateway: 'gateway', dnsPrimary: 'dns_primary', dnsSecondary: 'dns_secondary',
    leaseHours: 'lease_hours', serverIp: 'server_ip',
  };
  for (const [k, col] of Object.entries(map)) {
    if (updates[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(String(updates[k]));
    }
  }
  if (fields.length === 0) return getConfig();
  values.push(1);
  run(`UPDATE dhcp_config SET ${fields.join(', ')} WHERE id = 1`, values);
  saveDatabase();

  // 若服务在运行，热更新配置
  if (serverInstance) {
    const cfg = getConfig();
    serverInstance._conf.range = [cfg.pool_start, cfg.pool_end];
    serverInstance._conf.netmask = cfg.netmask;
    serverInstance._conf.static = buildStaticMap();
    serverInstance._conf.leaseTime = (cfg.lease_hours || 24) * 3600;
    if (cfg.gateway) serverInstance._conf.router = cfg.gateway;
    const dns = [cfg.dns_primary, cfg.dns_secondary].filter(Boolean);
    if (dns.length) serverInstance._conf.dns = dns;
    if (cfg.server_ip) serverInstance._conf.server = cfg.server_ip;
  }
  return getConfig();
}

/** 添加绑定 */
function addReservation(mac, ip, hostname = '', note = '') {
  const cleanMac = String(mac || '').trim().toLowerCase();
  if (!/^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/.test(cleanMac) && !/^[0-9a-f]{12}$/.test(cleanMac.replace(/[:-]/g, ''))) {
    throw new Error('MAC 地址格式不正确');
  }
  const normMac = cleanMac.replace(/[-:]/g, '').match(/.{2}/g).join(':');
  run('INSERT OR REPLACE INTO dhcp_reservations (mac, ip, hostname, note, created_at) VALUES (?, ?, ?, ?, ?)',
    [normMac, String(ip || '').trim(), hostname, note, nowIso()]);
  saveDatabase();
  // 热更新
  if (serverInstance) serverInstance._conf.static = buildStaticMap();
  return getReservations();
}

/** 删除绑定 */
function removeReservation(mac) {
  const normMac = String(mac || '').trim().toLowerCase().replace(/[-:]/g, '').match(/.{2}/g).join(':');
  run('DELETE FROM dhcp_reservations WHERE mac = ?', [normMac]);
  saveDatabase();
  if (serverInstance) serverInstance._conf.static = buildStaticMap();
  return getReservations();
}

/**
 * 检测网络中是否有 DHCP 服务器
 * 发送 DHCPDISCOVER，监听 3 秒看有没有 DHCPOFFER 回应
 */
function detect() {
  return new Promise((resolve) => {
    if (serverInstance) {
      // 自己的 DHCP 在跑，当然有
      return resolve({ detected: true, self: true, message: 'NAS DHCP 服务正在运行' });
    }

    let client = null;
    let timer = null;
    const servers = [];
    let resolved = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (client) { try { client.close(); } catch (_) {} }
      resolve(result);
    };

    try {
      client = dhcp.createClient({});

      client.on('message', (data) => {
        // 收到 DHCPOFFER 或 DHCPACK 说明有 DHCP 服务器
        // dhcp 库的 options 以数字 ID 为键：53=DHCPMessageType（2=OFFER,5=ACK）
        const opt = data.options || {};
        const type = opt[53];
        if (type !== 2 && type !== 5) return;
        const serverIp = data.siaddr || opt[54] || ''; // 54=ServerIdentifier
        // 同一台服务器会先回 OFFER 再回 ACK，按 serverIp 去重，避免重复计数
        if (serverIp && servers.some((s) => s.serverIp === serverIp)) return;
        const mac = data.chaddr ? Buffer.from(data.chaddr).toString('hex').match(/.{2}/g)?.join(':') : '';
        servers.push({ serverIp, offeredIp: data.yiaddr || '', mac });
      });

      client.on('error', (err) => {
        done({ detected: false, error: '无法监听（需要管理员权限绑定 UDP 68 端口）', rawError: err.message });
      });

      client.listen();
      // 发送探测
      try { client.sendDiscover(); } catch (_) {}

      timer = setTimeout(() => {
        done({
          detected: servers.length > 0,
          servers,
          message: servers.length > 0
            ? `检测到 ${servers.length} 个 DHCP 服务器：${servers.map((s) => s.serverIp).filter(Boolean).join(', ')}`
            : '未检测到 DHCP 服务器，可以启动 NAS DHCP',
        });
      }, 3000);
    } catch (err) {
      done({ detected: false, error: '检测失败：' + (err.message || ''), rawError: err.message });
    }
  });
}

module.exports = {
  getConfig,
  getReservations,
  detectServerIp,
  start,
  stop,
  getStatus,
  updateConfig,
  addReservation,
  removeReservation,
  detect,
};
