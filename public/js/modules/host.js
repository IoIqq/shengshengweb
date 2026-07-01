/**
 * 主机控制模块 — 电源 + 网络 + 防火墙
 */
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

let countdownTimer = null;
let allFirewallRules = [];
let blockedIps = new Set();
let lastArpTable = [];
let lastOnlineIps = new Set();

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isValidIpv4(ip) {
  const m = String(ip || '').match(IPV4_RE);
  return !!m && m.slice(1).every((seg) => Number(seg) >= 0 && Number(seg) <= 255);
}

export async function renderHost() {
  await Promise.all([loadNetworkInfo(), loadFirewallRules(), loadLanClients()]);
}

/** 解析 user-agent 为简短设备/浏览器描述 */
function parseUA(ua) {
  if (!ua) return '未知';
  let browser = '浏览器';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  let os = '未知系统';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} · ${os}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return iso; }
}

export async function loadLanClients() {
  const onlineTb = document.getElementById('host-online-tbody');
  const arpTb = document.getElementById('host-arp-tbody');
  const connTb = document.getElementById('host-conn-tbody');
  try {
    const { onlineUsers = [], arpTable = [], connections = [] } = await requestJSON('/api/host/lan-clients');

    // 在线用户
    if (onlineTb) {
      onlineTb.innerHTML = onlineUsers.length === 0
        ? '<tr><td colspan="6" class="fb-empty">暂无在线用户</td></tr>'
        : onlineUsers.map((u) => `<tr>
            <td><strong>${escapeHtml(u.displayName)}</strong><br><span class="host-cell-sub">${escapeHtml(u.username)}</span></td>
            <td><span class="svc-badge is-running">${escapeHtml(u.role)}</span></td>
            <td class="host-cell-mono">${escapeHtml(u.ipAddress || '—')}</td>
            <td>${escapeHtml(parseUA(u.userAgent))}</td>
            <td class="host-cell-sub">${fmtTime(u.createdAt)}</td>
            <td class="host-cell-sub">${fmtTime(u.expiresAt)}</td>
          </tr>`).join('');
    }

    // ARP 表
    if (arpTb) {
      // 标记 ARP 中也出现在在线用户里的 IP
      const onlineIPs = new Set(onlineUsers.map((u) => u.ipAddress).filter(Boolean));
      lastArpTable = arpTable;
      lastOnlineIps = onlineIPs;
      renderArpRows();
    }

    // 活跃连接
    if (connTb) {
      const established = connections.filter((c) => c.state === 'ESTABLISHED');
      connTb.innerHTML = established.length === 0
        ? '<tr><td colspan="4" class="fb-empty">无活跃连接</td></tr>'
        : established.map((c) => `<tr>
            <td class="host-cell-mono">${escapeHtml(c.localAddr)}</td>
            <td class="host-cell-mono">${escapeHtml(c.remoteAddr)}</td>
            <td><span class="svc-badge is-running">${escapeHtml(c.state)}</span></td>
            <td class="host-cell-mono">${escapeHtml(String(c.pid))}</td>
          </tr>`).join('');
    }
  } catch (error) {
    if (onlineTb) onlineTb.innerHTML = `<tr><td colspan="6" class="fb-empty">加载失败：${escapeHtml(error.message || '')}</td></tr>`;
    if (arpTb) arpTb.innerHTML = `<tr><td colspan="5" class="fb-empty">加载失败</td></tr>`;
    if (connTb) connTb.innerHTML = `<tr><td colspan="4" class="fb-empty">加载失败</td></tr>`;
  }
}

/** 渲染 ARP 表行（含访问控制：允许/拒绝 IP）。依赖 lastArpTable / lastOnlineIps / blockedIps */
function renderArpRows() {
  const arpTb = document.getElementById('host-arp-tbody');
  if (!arpTb) return;
  if (lastArpTable.length === 0) {
    arpTb.innerHTML = '<tr><td colspan="5" class="fb-empty">无 ARP 记录（可能需要先与其他设备通信）</td></tr>';
    return;
  }
  arpTb.innerHTML = lastArpTable.map((a) => {
    const online = lastOnlineIps.has(a.ip);
    const blocked = blockedIps.has(a.ip);
    const valid = isValidIpv4(a.ip);
    // 访问控制按钮：默认放行，可拉黑；已拉黑则显示"允许"以解封
    let ctrl = '';
    if (valid) {
      ctrl = blocked
        ? `<span class="host-fw-tag is-blocked">已封禁</span><button class="fb-item-action" data-fw-ip="${escapeHtml(a.ip)}" data-fw-action="unblock">允许</button>`
        : `<button class="fb-item-action fb-action-danger" data-fw-ip="${escapeHtml(a.ip)}" data-fw-action="block">拒绝</button>`;
    }
    return `<tr${online ? ' class="is-highlight"' : ''}>
      <td class="host-cell-mono">${escapeHtml(a.ip)}</td>
      <td class="host-cell-mono">${escapeHtml(a.mac)}</td>
      <td>${escapeHtml(a.type)}</td>
      <td class="host-cell-mono">${escapeHtml(a.interface || '—')}</td>
      <td class="host-arp-ctrl">${online ? '<span class="svc-badge is-running">已登录</span>' : ''}${ctrl}</td>
    </tr>`;
  }).join('');
}

export async function loadNetworkInfo() {
  const grid = document.getElementById('host-net-grid');
  if (!grid) return;
  grid.innerHTML = '<p class="fb-empty">加载中…</p>';
  try {
    const { hostname, interfaces = [] } = await requestJSON('/api/host/network');
    const external = interfaces.filter((i) => !i.internal);
    if (external.length === 0) {
      grid.innerHTML = '<p class="fb-empty">无外部网络接口</p>';
      return;
    }
    grid.innerHTML = external.map((i) => `<div class="host-net-card">
      <p class="host-net-name">${escapeHtml(i.interface)}</p>
      <p class="host-net-meta"><span class="svc-badge ${i.family === 'IPv4' ? 'is-running' : 'is-stopped'}">${escapeHtml(i.family)}</span> ${escapeHtml(i.address)}</p>
      <p class="host-net-meta">掩码: ${escapeHtml(i.netmask)}</p>
      <p class="host-net-meta">MAC: ${escapeHtml(i.mac)}</p>
    </div>`).join('');
  } catch (error) {
    grid.innerHTML = `<p class="fb-empty">加载失败：${escapeHtml(error.message || '')}</p>`;
  }
}

export async function loadFirewallRules() {
  const tbody = document.getElementById('host-fw-tbody');
  try {
    const { rules = [], blockedIps: blocked = [], note } = await requestJSON('/api/host/firewall');
    allFirewallRules = rules;
    blockedIps = new Set(blocked);
    // 防火墙状态回来后刷新 ARP 表的访问控制按钮
    renderArpRows();
    if (!tbody) return;
    if (note) {
      tbody.innerHTML = `<tr><td colspan="6" class="fb-empty">${escapeHtml(note)}</td></tr>`;
      return;
    }
    renderFirewallRows(rules);
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="fb-empty">加载失败：${escapeHtml(error.message || '')}</td></tr>`;
  }
}

function renderFirewallRows(rules) {
  const tbody = document.getElementById('host-fw-tbody');
  if (!tbody) return;
  if (rules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="fb-empty">无规则</td></tr>';
    return;
  }
  tbody.innerHTML = rules.slice(0, 300).map((r) => `<tr>
    <td class="svc-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td>
    <td>${escapeHtml(r.enabled)}</td>
    <td>${escapeHtml(r.direction)}</td>
    <td>${escapeHtml(r.action)}</td>
    <td>${escapeHtml(r.protocol)}</td>
    <td>${escapeHtml(r.localPort)}</td>
  </tr>`).join('');
}

async function powerAction(action) {
  const labels = { shutdown: '关机', reboot: '重启', 'cancel-shutdown': '取消关机' };
  if (action !== 'cancel-shutdown') {
    if (!confirm(`确定要${labels[action]}？\n系统将在 30 秒后执行，期间可取消。`)) return;
  }
  try {
    const data = await requestJSON(`/api/host/${action}`, { method: 'POST', retry: false });
    Toast.show(data.message || '操作已发送', 'success');
    if (action === 'shutdown' || action === 'reboot') {
      startCountdown(data.delay || 30, action);
    } else {
      stopCountdown();
    }
  } catch (error) {
    Toast.show(error.message || '操作失败', 'error');
  }
}

function startCountdown(seconds, action) {
  stopCountdown();
  const el = document.getElementById('host-countdown');
  if (!el) return;
  let remaining = seconds;
  el.hidden = false;
  const update = () => {
    el.textContent = `系统将在 ${remaining} 秒后${action === 'shutdown' ? '关机' : '重启'}…　点击"取消关机"可中止。`;
    if (remaining <= 0) { stopCountdown(); return; }
    remaining--;
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  const el = document.getElementById('host-countdown');
  if (el) { el.hidden = true; el.textContent = ''; }
}

export function bindHostEvents() {
  const refreshBtn = document.getElementById('host-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => { loadNetworkInfo(); loadFirewallRules(); loadLanClients(); });

  const lanRefreshBtn = document.getElementById('host-lan-refresh-btn');
  if (lanRefreshBtn) lanRefreshBtn.addEventListener('click', () => { loadLanClients(); loadFirewallRules(); });

  const shutdownBtn = document.getElementById('host-shutdown-btn');
  if (shutdownBtn) shutdownBtn.addEventListener('click', () => powerAction('shutdown'));
  const rebootBtn = document.getElementById('host-reboot-btn');
  if (rebootBtn) rebootBtn.addEventListener('click', () => powerAction('reboot'));
  const cancelBtn = document.getElementById('host-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => powerAction('cancel-shutdown'));

  const fwSearch = document.getElementById('host-fw-search');
  if (fwSearch) {
    fwSearch.addEventListener('input', () => {
      const q = fwSearch.value.toLowerCase().trim();
      if (!q) { renderFirewallRows(allFirewallRules); return; }
      renderFirewallRows(allFirewallRules.filter((r) => r.name?.toLowerCase().includes(q)));
    });
  }

  // ARP 表访问控制：事件委托到 tbody，处理"拒绝/允许"按钮
  const arpTb = document.getElementById('host-arp-tbody');
  if (arpTb) {
    arpTb.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fw-action]');
      if (!btn) return;
      firewallAction(btn.dataset.fwAction, btn.dataset.fwIp, btn);
    });
  }
}

// ========== 防火墙访问控制（默认放行，可拉黑 IP） ==========
async function firewallAction(action, ip, btn) {
  if (!isValidIpv4(ip)) { Toast.show('IP 地址不合法', 'error'); return; }
  if (action === 'block' && !confirm(`拒绝 ${ip} 访问本机？\n将写入一条防火墙入站封禁规则，可随时解封。`)) return;
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    const data = await requestJSON(`/api/host/firewall/${action}`, { method: 'POST', body: { ip }, retry: false });
    if (action === 'block') blockedIps.add(ip); else blockedIps.delete(ip);
    Toast.show(data.message || '操作成功', 'success');
    renderArpRows();
    // 后台刷新完整防火墙规则列表（不阻塞 UI）
    loadFirewallRules();
  } catch (error) {
    Toast.show(error.message || '操作失败', 'error');
    if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
}
