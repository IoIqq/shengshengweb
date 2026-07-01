/**
 * 主机控制模块 — 电源 + 网络 + 防火墙
 */
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

let countdownTimer = null;
let allFirewallRules = [];

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderHost() {
  await Promise.all([loadNetworkInfo(), loadFirewallRules(), loadLanClients(), loadDhcpStatus()]);
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
      arpTb.innerHTML = arpTable.length === 0
        ? '<tr><td colspan="5" class="fb-empty">无 ARP 记录（可能需要先与其他设备通信）</td></tr>'
        : arpTable.map((a) => `<tr${onlineIPs.has(a.ip) ? ' class="is-highlight"' : ''}>
            <td class="host-cell-mono">${escapeHtml(a.ip)}</td>
            <td class="host-cell-mono">${escapeHtml(a.mac)}</td>
            <td>${escapeHtml(a.type)}</td>
            <td class="host-cell-mono">${escapeHtml(a.interface || '—')}</td>
            <td>${onlineIPs.has(a.ip) ? '<span class="svc-badge is-running">已登录</span>' : ''}</td>
          </tr>`).join('');
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
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="fb-empty">加载中…</td></tr>';
  try {
    const { rules = [], note } = await requestJSON('/api/host/firewall');
    allFirewallRules = rules;
    if (note) {
      tbody.innerHTML = `<tr><td colspan="6" class="fb-empty">${escapeHtml(note)}</td></tr>`;
      return;
    }
    renderFirewallRows(rules);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="fb-empty">加载失败：${escapeHtml(error.message || '')}</td></tr>`;
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
  if (lanRefreshBtn) lanRefreshBtn.addEventListener('click', () => loadLanClients());

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

  // DHCP 事件
  const dhcpStart = document.getElementById('dhcp-start-btn');
  if (dhcpStart) dhcpStart.addEventListener('click', dhcpToggle);
  const dhcpStop = document.getElementById('dhcp-stop-btn');
  if (dhcpStop) dhcpStop.addEventListener('click', dhcpToggle);
  const dhcpSave = document.getElementById('dhcp-save-btn');
  if (dhcpSave) dhcpSave.addEventListener('click', saveDhcpConfig);
  const dhcpAdd = document.getElementById('dhcp-r-add-btn');
  if (dhcpAdd) dhcpAdd.addEventListener('click', addDhcpReservation);
  const dhcpDetect = document.getElementById('dhcp-detect-btn');
  if (dhcpDetect) dhcpDetect.addEventListener('click', detectDhcp);

  const dhcpRefresh = document.getElementById('host-lan-refresh-btn');
  if (dhcpRefresh) dhcpRefresh.addEventListener('click', loadDhcpStatus);
}

// ========== DHCP ==========
async function loadDhcpStatus() {
  try {
    const st = await requestJSON('/api/dhcp/status');
    renderDhcpStatus(st);
  } catch (error) {
    Toast.show('获取 DHCP 状态失败', 'error');
  }
}

function renderDhcpStatus(st) {
  const badge = document.getElementById('dhcp-status-badge');
  const startBtn = document.getElementById('dhcp-start-btn');
  const stopBtn = document.getElementById('dhcp-stop-btn');
  if (badge) {
    badge.textContent = st.running ? '运行中' : '未运行';
    badge.className = 'dhcp-status-badge ' + (st.running ? 'is-running' : '');
  }
  if (startBtn) startBtn.hidden = st.running;
  if (stopBtn) stopBtn.hidden = !st.running;

  const c = st.config || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set('dhcp-pool-start', c.poolStart);
  set('dhcp-pool-end', c.poolEnd);
  set('dhcp-netmask', c.netmask);
  set('dhcp-gateway', c.gateway);
  set('dhcp-dns1', c.dnsPrimary);
  set('dhcp-dns2', c.dnsSecondary);
  set('dhcp-lease', c.leaseHours);
  set('dhcp-server-ip', c.serverIp || st.detectedIp);

  // 绑定表
  const reserveTb = document.getElementById('dhcp-reserve-tbody');
  if (reserveTb) {
    const rows = st.reservations || [];
    reserveTb.innerHTML = rows.length === 0
      ? '<tr><td colspan="5" class="fb-empty">无绑定</td></tr>'
      : rows.map((r) => `<tr>
          <td class="host-cell-mono">${escapeHtml(r.mac)}</td>
          <td class="host-cell-mono">${escapeHtml(r.ip)}</td>
          <td>${escapeHtml(r.hostname || '—')}</td>
          <td>${escapeHtml(r.note || '—')}</td>
          <td><button class="fb-item-action fb-action-danger" data-mac="${escapeHtml(r.mac)}" data-action="del-reserve">删除</button></td>
        </tr>`).join('');
    reserveTb.querySelectorAll('[data-action="del-reserve"]').forEach((btn) => {
      btn.addEventListener('click', () => delDhcpReservation(btn.dataset.mac));
    });
  }

  // 租约表
  const leaseTb = document.getElementById('dhcp-lease-tbody');
  if (leaseTb) {
    const leases = st.leases || [];
    leaseTb.innerHTML = leases.length === 0
      ? '<tr><td colspan="4" class="fb-empty">无活跃租约</td></tr>'
      : leases.map((l) => `<tr>
          <td class="host-cell-mono">${escapeHtml(l.ip)}</td>
          <td class="host-cell-mono">${escapeHtml(l.mac || '—')}</td>
          <td>${escapeHtml(l.hostname || '—')}</td>
          <td><span class="svc-badge is-running">已分配</span></td>
        </tr>`).join('');
  }
}

async function dhcpToggle() {
  const action = document.getElementById('dhcp-start-btn')?.hidden ? 'stop' : 'start';
  if (action === 'start') {
    // 启动前先检测网络中是否已有 DHCP 服务器（路由器）
    const detectResult = document.getElementById('dhcp-detect-result');
    if (detectResult) { detectResult.hidden = false; detectResult.textContent = '🔍 正在检测网络中的 DHCP 服务器…'; detectResult.className = 'dhcp-detect-result'; }
    try {
      const r = await requestJSON('/api/dhcp/detect', { method: 'POST', retry: false });
      if (r.detected && !r.self) {
        const serverList = (r.servers || []).map((s) => s.serverIp).filter(Boolean).join(', ');
        if (detectResult) {
          detectResult.className = 'dhcp-detect-result is-warn';
          detectResult.textContent = `⚠ 检测到网络中已有 DHCP 服务器${serverList ? '（' + serverList + '）' : ''}。\n同时运行两个 DHCP 会冲突！\n仍要启动 NAS DHCP 吗？`;
        }
        if (!confirm('检测到网络中已有 DHCP 服务器（可能是路由器）。\n同时运行两个 DHCP 会导致 IP 冲突！\n\n仍要启动 NAS DHCP 吗？')) {
          if (detectResult) detectResult.hidden = true;
          return;
        }
      } else if (r.error) {
        if (detectResult) {
          detectResult.className = 'dhcp-detect-result';
          detectResult.textContent = 'ℹ ' + r.error + '，跳过检测直接启动。';
        }
      } else if (!r.detected) {
        if (detectResult) {
          detectResult.className = 'dhcp-detect-result is-ok';
          detectResult.textContent = '✓ 未检测到其他 DHCP 服务器，可以安全启动。';
        }
      }
    } catch (_) { /* 检测失败不阻塞启动 */ }

    if (!confirm('启动 DHCP 服务后，本机将为局域网中的设备自动分配 IP。\n\n请确认：\n1. 网络中没有其他 DHCP 服务器\n2. 本程序以管理员身份运行\n\n确定启动？')) return;
  }
  try {
    await requestJSON(`/api/dhcp/${action}`, { method: 'POST', retry: false });
    Toast.show(action === 'start' ? 'DHCP 服务已启动' : 'DHCP 服务已停止', 'success');
    await loadDhcpStatus();
  } catch (error) {
    Toast.show(error.message || '操作失败', 'error');
  }
}

async function detectDhcp() {
  const result = document.getElementById('dhcp-detect-result');
  const btn = document.getElementById('dhcp-detect-btn');
  if (btn) { btn.disabled = true; }
  if (result) { result.hidden = false; result.className = 'dhcp-detect-result'; result.textContent = '🔍 正在检测（3 秒）…'; }
  try {
    const r = await requestJSON('/api/dhcp/detect', { method: 'POST', retry: false });
    if (result) {
      if (r.error) {
        result.className = 'dhcp-detect-result';
        result.textContent = 'ℹ ' + r.error;
      } else if (r.detected) {
        if (r.self) {
          result.className = 'dhcp-detect-result is-ok';
          result.textContent = '✓ NAS DHCP 服务正在运行';
        } else {
          const servers = (r.servers || []).map((s) => `${s.serverIp || '未知'}（分配 ${s.offeredIp || '?'}）`).join('；');
          result.className = 'dhcp-detect-result is-warn';
          result.textContent = `⚠ 检测到 DHCP 服务器：${servers || '已响应'}\n无需启动 NAS DHCP，否则会冲突。`;
        }
      } else {
        result.className = 'dhcp-detect-result is-ok';
        result.textContent = '✓ 未检测到 DHCP 服务器。可以启动 NAS DHCP 为网络分配 IP。';
      }
    }
  } catch (error) {
    if (result) { result.className = 'dhcp-detect-result'; result.textContent = '检测失败：' + (error.message || ''); }
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

async function saveDhcpConfig() {
  const body = {
    poolStart: document.getElementById('dhcp-pool-start')?.value?.trim() || '',
    poolEnd: document.getElementById('dhcp-pool-end')?.value?.trim() || '',
    netmask: document.getElementById('dhcp-netmask')?.value?.trim() || '',
    gateway: document.getElementById('dhcp-gateway')?.value?.trim() || '',
    dnsPrimary: document.getElementById('dhcp-dns1')?.value?.trim() || '',
    dnsSecondary: document.getElementById('dhcp-dns2')?.value?.trim() || '',
    leaseHours: Number(document.getElementById('dhcp-lease')?.value) || 24,
    serverIp: document.getElementById('dhcp-server-ip')?.value?.trim() || '',
  };
  try {
    await requestJSON('/api/dhcp/config', { method: 'PATCH', body, retry: false });
    Toast.show('配置已保存', 'success');
  } catch (error) {
    Toast.show(error.message || '保存失败', 'error');
  }
}

async function addDhcpReservation() {
  const mac = document.getElementById('dhcp-r-mac')?.value?.trim();
  const ip = document.getElementById('dhcp-r-ip')?.value?.trim();
  const hostname = document.getElementById('dhcp-r-name')?.value?.trim() || '';
  if (!mac || !ip) { Toast.show('MAC 和 IP 不能为空', 'error'); return; }
  try {
    const { reservations } = await requestJSON('/api/dhcp/reservations', { method: 'POST', body: { mac, ip, hostname }, retry: false });
    Toast.show('绑定已添加', 'success');
    document.getElementById('dhcp-r-mac').value = '';
    document.getElementById('dhcp-r-ip').value = '';
    document.getElementById('dhcp-r-name').value = '';
    await loadDhcpStatus();
  } catch (error) {
    Toast.show(error.message || '添加失败', 'error');
  }
}

async function delDhcpReservation(mac) {
  if (!confirm(`删除绑定 ${mac}？`)) return;
  try {
    await requestJSON(`/api/dhcp/reservations/${encodeURIComponent(mac)}`, { method: 'DELETE', retry: false });
    Toast.show('已删除', 'success');
    await loadDhcpStatus();
  } catch (error) {
    Toast.show(error.message || '删除失败', 'error');
  }
}
