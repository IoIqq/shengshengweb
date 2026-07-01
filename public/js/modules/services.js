/**
 * 服务管理模块 — Windows 服务列表 + 启停
 */
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

let allServices = [];

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderServices() {
  await loadServiceList();
}

export async function loadServiceList() {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="fb-empty">加载中…</td></tr>';
  try {
    const { services = [], note } = await requestJSON('/api/services/list');
    allServices = services;
    if (note) {
      const noteEl = document.getElementById('svc-note');
      if (noteEl) noteEl.textContent = note;
    }
    renderServiceRows(services);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="fb-empty">加载失败：${escapeHtml(error.message || '')}</td></tr>`;
  }
}

function renderServiceRows(services) {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;
  if (services.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="fb-empty">无服务</td></tr>';
    return;
  }
  tbody.innerHTML = services.map((s) => {
    const running = s.state === 'Running';
    return `<tr data-name="${escapeHtml(s.name)}">
      <td class="svc-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
      <td title="${escapeHtml(s.displayName)}">${escapeHtml(s.displayName)}</td>
      <td><span class="svc-badge ${running ? 'is-running' : 'is-stopped'}">${escapeHtml(s.state)}</span></td>
      <td>${escapeHtml(s.startType)}</td>
      <td class="svc-actions">
        <button class="ghost-btn svc-btn" data-action="${running ? 'stop' : 'start'}" data-name="${escapeHtml(s.name)}" type="button">${running ? '停止' : '启动'}</button>
        <button class="ghost-btn svc-btn" data-action="restart" data-name="${escapeHtml(s.name)}" type="button">重启</button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.svc-btn').forEach((btn) => {
    btn.addEventListener('click', () => serviceAction(btn.dataset.name, btn.dataset.action));
  });
}

async function serviceAction(name, action) {
  if (!confirm(`确定对服务「${name}」执行${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}操作？`)) return;
  try {
    Toast.show(`正在${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'} ${name}…`, 'info');
    await requestJSON(`/api/services/${encodeURIComponent(name)}/${action}`, { method: 'POST', retry: false });
    Toast.show('操作已发送', 'success');
    setTimeout(loadServiceList, 1500);
  } catch (error) {
    Toast.show(error.message || '操作失败', 'error');
  }
}

export function bindServicesEvents() {
  const refreshBtn = document.getElementById('svc-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadServiceList);

  const search = document.getElementById('svc-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase().trim();
      if (!q) { renderServiceRows(allServices); return; }
      const filtered = allServices.filter((s) => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q));
      renderServiceRows(filtered);
    });
  }
}
