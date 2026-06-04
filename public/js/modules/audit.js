/**
 * 审计日志模块
 */

import { request } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { createSkeleton } from '../ui/loading.js';

let currentPage = 1;
let currentFilters = {};
let isLoading = false;

/**
 * 初始化审计日志
 */
export function initAuditLogs() {
  loadAuditLogs();
  bindAuditEvents();
  loadUserFilter();
}

/**
 * 加载审计日志
 */
export async function loadAuditLogs(page = 1, filters = {}) {
  currentPage = page;
  currentFilters = filters;

  try {
    isLoading = true;
    renderAuditLogList([]); // 显示骨架屏

    const params = new URLSearchParams({
      page,
      limit: 50,
      ...filters,
    });

    const { logs, pagination } = await request(`/api/audit-logs?${params}`);
    isLoading = false;
    renderAuditLogList(logs);
    renderPagination(pagination);
  } catch (error) {
    isLoading = false;
    console.error('加载审计日志失败：', error);
    Toast.error(error.message || '加载审计日志失败');
  }
}

/**
 * 渲染审计日志列表
 */
function renderAuditLogList(logs) {
  const container = document.getElementById('audit-log-list');
  if (!container) return;

  // 显示骨架屏
  if (isLoading || !logs || logs.length === 0 && isLoading) {
    container.innerHTML = createSkeleton('list', 5);
    return;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无审计日志</p>';
    return;
  }

  container.innerHTML = logs.map((log) => createAuditLogItem(log)).join('');
}

/**
 * 创建审计日志条目HTML
 */
function createAuditLogItem(log) {
  const actionLabels = {
    login: '登录',
    create: '创建',
    update: '更新',
    delete: '删除',
  };

  const actionIcons = {
    login: '🔐',
    create: '➕',
    update: '✏️',
    delete: '🗑️',
  };

  const resourceTypeLabels = {
    auth: '认证',
    user: '用户',
    media: '素材',
    todo: '待办',
    team: '团队',
    device: '设备',
    borrow: '借出',
    wish: '留言',
  };

  const time = new Date(log.created_at).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const detailsText = log.details
    ? Object.entries(log.details)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
    : '';

  const actionIcon = actionIcons[log.action] || '';
  const actionLabel = actionLabels[log.action] || log.action;

  return `
    <div class="audit-log-item">
      <div class="audit-time">${time}</div>
      <div class="audit-user">
        <span class="user-badge ${log.role}">${log.username}</span>
      </div>
      <div class="audit-action">
        <span class="action-badge ${log.action}">
          <span class="status-icon" aria-hidden="true">${actionIcon}</span>
          ${actionLabel}
        </span>
        <span class="resource-type">${resourceTypeLabels[log.resource_type] || log.resource_type}</span>
      </div>
      <div class="audit-details" title="${detailsText}">
        ${detailsText || '-'}
      </div>
      <div class="audit-ip">${log.ip_address || '-'}</div>
    </div>
  `;
}

/**
 * 渲染分页
 */
function renderPagination(pagination) {
  const container = document.getElementById('audit-pagination');
  if (!container) return;

  const { page, totalPages, total } = pagination;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" type="button">上一页</button>
    <span class="page-info">第 ${page} / ${totalPages} 页（共 ${total} 条）</span>
    <button ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}" type="button">下一页</button>
  `;

  // 绑定分页按钮事件
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const newPage = parseInt(btn.dataset.page);
      loadAuditLogs(newPage, currentFilters);
    });
  });
}

/**
 * 加载用户筛选下拉
 */
async function loadUserFilter() {
  try {
    const { users } = await request('/api/users');
    const select = document.getElementById('audit-user-filter');
    if (!select) return;

    const options = users
      .map((user) => `<option value="${user.id}">${user.username}</option>`)
      .join('');

    select.innerHTML = `<option value="">所有用户</option>${options}`;
  } catch (error) {
    console.error('加载用户列表失败：', error);
  }
}

/**
 * 绑定审计日志事件
 */
function bindAuditEvents() {
  const filterBtn = document.getElementById('audit-filter-btn');
  const resetBtn = document.getElementById('audit-reset-btn');
  const exportBtn = document.getElementById('export-logs-btn');

  if (filterBtn) {
    filterBtn.addEventListener('click', applyFilters);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', exportAuditLogs);
  }
}

/**
 * 应用筛选
 */
function applyFilters() {
  const filters = {};

  const userId = document.getElementById('audit-user-filter')?.value;
  if (userId) filters.user_id = userId;

  const action = document.getElementById('audit-action-filter')?.value;
  if (action) filters.action = action;

  const startDate = document.getElementById('audit-start-date')?.value;
  if (startDate) filters.start_date = startDate;

  const endDate = document.getElementById('audit-end-date')?.value;
  if (endDate) filters.end_date = endDate;

  loadAuditLogs(1, filters);
}

/**
 * 重置筛选
 */
function resetFilters() {
  document.getElementById('audit-user-filter').value = '';
  document.getElementById('audit-action-filter').value = '';
  document.getElementById('audit-start-date').value = '';
  document.getElementById('audit-end-date').value = '';

  loadAuditLogs(1, {});
}

/**
 * 导出审计日志
 */
function exportAuditLogs() {
  const params = new URLSearchParams(currentFilters);
  const url = `/api/audit-logs/export?${params}`;

  Toast.info('正在导出审计日志...');
  window.open(url, '_blank');
}
