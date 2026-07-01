/**
 * Dashboard（工作台概览）模块
 * 负责首页统计数据、今日重点、快捷操作和最近动态的渲染
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, formatDatetime, safeText, currentRole } from '../utils/helpers.js';
import { todoDayKey, classifyTodoByDate, formatDueLabel } from './todo.js';
import { isOverdue } from './borrow.js';
import { runDashboardCountUpOnce, triggerHeroCleared } from '../ui/animations.js';
import { roleWorkspaceLabel } from '../core/router.js';

function canUseShortcut(shortcut) {
  const role = currentRole();
  if (shortcut.minRole === 'admin') return role === 'admin';
  if (shortcut.minRole === 'editor') return role === 'admin' || role === 'editor';
  return true;
}

const mediaIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const todoIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
const teamIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

/**
 * 渲染工作台概览
 */
export function renderDashboard() {
  const dashboardCounts = state.bootstrap?.dashboard?.counts || {};
  const counts = {
    ...dashboardCounts,
    devices: Array.isArray(state.deviceCatalog) ? state.deviceCatalog.length : dashboardCounts.devices ?? 0,
    borrowOpen: Array.isArray(state.borrowCatalog)
      ? state.borrowCatalog.filter((item) => item.status === 'pending').length
      : dashboardCounts.borrowOpen ?? 0,
  };

  // 更新标题日期 & 角色标签（fix: 曾硬编码在 HTML 里）
  const titleEl = document.getElementById('overview-title');
  if (titleEl) {
    const n = new Date();
    titleEl.textContent = `${n.getFullYear()} / ${String(n.getMonth() + 1).padStart(2, '0')} / ${String(n.getDate()).padStart(2, '0')} · 工作台值班`;
  }
  const rolePill = document.getElementById('role-pill');
  if (rolePill) rolePill.textContent = roleWorkspaceLabel(currentRole());

  // 更新日期时间徽章
  const dateBadge = document.getElementById('overview-date-badge');
  if (dateBadge) {
    const now = new Date();
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    const monthDay = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    dateBadge.setAttribute('aria-label', `当前时间：${monthDay} ${weekday} ${time}`);
    dateBadge.innerHTML = `<span class="date-day">${weekday}</span><span class="date-md">${monthDay}</span><span class="date-time">${time}</span>`;
  }

  // 提醒徽章
  const alertsEl = document.getElementById('overview-alerts');
  if (alertsEl) {
    const overdueCount = (state.borrowCatalog || []).filter(
      (b) => b.status === 'approved' && isOverdue(b.expectedReturnAt, b.returnStatus)
    ).length;
    const alerts = [
      { tone: 'pending', value: counts.pending ?? 0, label: '待审素材', target: canUseShortcut({ minRole: 'editor' }) ? 'review' : 'media' },
      { tone: 'todo', value: counts.todoOpen ?? 0, label: '未完待办', target: 'todo' },
      { tone: 'danger', value: overdueCount, label: '逾期借出', target: 'borrow' },
    ];
    alertsEl.innerHTML = alerts
      .map(
        (a) => {
          const stateText = a.value > 0 ? '需要处理' : '暂无待处理';
          return `
        <button class="alert-chip" data-jump="${escapeHtml(a.target)}" data-tone="${escapeHtml(a.tone)}" type="button" aria-label="${escapeHtml(a.label)}：${safeText(a.value)} 项，${stateText}" ${a.value > 0 ? 'data-active="true"' : ''}>
          <span class="alert-value">${safeText(a.value)}</span>
          <span class="alert-label">${escapeHtml(a.label)}</span>
          <span class="alert-state">${stateText}</span>
          ${a.value > 0 ? '<span class="alert-pulse" aria-hidden="true"></span>' : ''}
        </button>
      `;
        },
      )
      .join('');
  }

  const items = [
    { label: '素材总数', value: counts.all ?? 0, jump: 'media', tone: 'neutral' },
    { label: '待审', value: counts.pending ?? 0, jump: 'review', tone: 'warning' },
    { label: '已通过', value: counts.approved ?? 0, jump: 'media', tone: 'success' },
    { label: '待办', value: counts.todoOpen ?? 0, jump: 'todo', tone: 'info' },
    { label: '设备', value: counts.devices ?? 0, jump: 'device', tone: 'neutral' },
    { label: '借出', value: counts.borrowOpen ?? 0, jump: 'borrow', tone: 'primary' },
  ];

  if (els.dashboardStats) {
    els.dashboardStats.innerHTML = items
      .map(
        (item) => {
          const hasAttention = item.value > 0 && (item.tone === 'warning' || item.tone === 'primary');
          const stateText = hasAttention ? '需要关注' : '查看详情';
          return `
          <li class="metric" data-tone="${escapeHtml(item.tone)}">
            <button class="metric-btn" data-jump="${escapeHtml(item.jump)}" type="button" aria-label="查看${escapeHtml(item.label)}，当前 ${safeText(item.value)} 项">
              <strong class="metric-num">${safeText(item.value)}</strong>
              <span class="metric-hint">${escapeHtml(item.label)}</span>
              <small class="metric-state">${stateText}</small>
              ${hasAttention ? '<span class="metric-dot" aria-hidden="true"></span>' : ''}
            </button>
          </li>
        `;
        },
      )
      .join('');
  }

  // 今日重点：最新待审 / 未完成待办 / 即将归还
  const focusEl = document.getElementById('overview-focus');
  if (focusEl) {
    const pendingMedia = (state.bootstrap?.media || [])
      .filter((m) => m.reviewState === 'pending')
      .slice(0, 3);
    const todoTodayKey = todoDayKey(new Date());
    const allTodos = state.bootstrap?.todos || [];
    const overdueTodos = allTodos
      .filter((t) => !t.done && classifyTodoByDate(t, todoTodayKey) === 'overdue')
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const todayTodos = allTodos
      .filter((t) => !t.done && classifyTodoByDate(t, todoTodayKey) === 'today');
    const focusTodos = [...overdueTodos, ...todayTodos].slice(0, 4);
    const focusTodoTone = overdueTodos.length ? 'danger' : (todayTodos.length ? 'warning' : 'info');
    const focusTodoEmpty = (() => {
      if (allTodos.filter((t) => !t.done).length === 0) return '所有待办已完成';
      return '今日无紧急待办';
    })();
    const upcomingBorrows = (state.borrowCatalog || [])
      .filter((b) => b.status === 'approved' && b.returnStatus !== 'returned')
      .sort((a, b) => (a.expectedReturnAt || '').localeCompare(b.expectedReturnAt || ''))
      .slice(0, 3);

    focusEl.innerHTML = `
      <section class="focus-group" data-tone="warning">
        <header class="focus-group-head">
          <p class="eyebrow">最新待审</p>
          <button class="focus-link" data-jump="review" type="button" aria-label="查看全部待审素材">全部 →</button>
        </header>
        <div class="focus-rows">
          ${
  pendingMedia.length
    ? pendingMedia
      .map(
        (m) => `
                <div class="focus-row">
                  <img class="focus-thumb" src="${escapeHtml(m.thumb || '')}" alt="${escapeHtml(m.title || '待审素材缩略图')}" loading="lazy" />
                  <div class="focus-text">
                    <strong>${escapeHtml(m.title || '未命名')}</strong>
                    <small>${escapeHtml(m.author || '-')} · ${escapeHtml(m.kind || '')}</small>
                  </div>
                </div>
              `,
      )
      .join('')
    : '<p class="focus-empty">没有待审素材</p>'
}
        </div>
      </section>
      <section class="focus-group" data-tone="${focusTodoTone}">
        <header class="focus-group-head">
          <p class="eyebrow">${overdueTodos.length ? `逾期 ${overdueTodos.length} 项` : (todayTodos.length ? '今日截止' : '未完成待办')}</p>
          <button class="focus-link" data-jump="todo" type="button" aria-label="查看全部待办事项">全部 →</button>
        </header>
        <div class="focus-rows">
          ${
  focusTodos.length
    ? focusTodos
      .map(
        (t) => {
          const overdue = classifyTodoByDate(t, todoTodayKey) === 'overdue';
          const dueText = formatDueLabel(t, todoTodayKey);
          return `
                <div class="focus-row" ${overdue ? 'data-overdue="true"' : ''}>
                  <span class="focus-priority" data-priority="${escapeHtml(t.priority || '中')}">${escapeHtml(t.priority || '中')}</span>
                  <div class="focus-text">
                    <strong>${escapeHtml(t.title || '')}</strong>
                    <small>${escapeHtml(dueText)}</small>
                  </div>
                </div>
              `;
        },
      )
      .join('')
    : `<p class="focus-empty">${escapeHtml(focusTodoEmpty)}</p>`
}
        </div>
      </section>
      <section class="focus-group" data-tone="primary">
        <header class="focus-group-head">
          <p class="eyebrow">即将归还</p>
          <button class="focus-link" data-jump="borrow" type="button" aria-label="查看全部借出申请">全部 →</button>
        </header>
        <div class="focus-rows">
          ${
  upcomingBorrows.length
    ? upcomingBorrows
      .map((b) => {
        const overdue = isOverdue(b.expectedReturnAt, b.returnStatus);
        return `
                <div class="focus-row" ${overdue ? 'data-overdue="true"' : ''}>
                  <span class="focus-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></span>
                  <div class="focus-text">
                    <strong>${escapeHtml(b.deviceName || b.deviceId || '-')}</strong>
                    <small>${escapeHtml(b.applicant || '')} · ${overdue ? '已逾期' : '归还 ' + escapeHtml(formatDatetime(b.expectedReturnAt))}</small>
                  </div>
                </div>
              `;
      })
      .join('')
    : '<p class="focus-empty">没有借出中的设备</p>'
}
        </div>
      </section>
    `;
  }

  // 快捷操作区
  renderShortcuts();

  // 环形数据图
  renderMediaChart();

  // 存储空间环形图
  renderStorageChart();

  // 最近动态
  renderActivity();

  // 动效：数字 count-up（仅首次进入 / 刷新后）+ 「今日清零」能量条
  requestAnimationFrame(() => {
    runDashboardCountUpOnce();
    triggerHeroCleared({
      pendingReview: counts.pending ?? 0,
      todoOpen: counts.todoOpen ?? 0,
    });
  });
}

/**
 * 渲染快捷操作
 */
export function renderShortcuts() {
  const shortcutsEl = document.getElementById('overview-shortcuts');
  if (shortcutsEl) {
    const shortcuts = [
      { icon: mediaIcon, label: '浏览素材', action: 'jump-media' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>', label: '上传素材', action: 'upload' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>', label: '查看设备', action: 'jump-device' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>', label: '借用设备', action: 'jump-borrow' },
      { icon: todoIcon, label: '查看待办', action: 'jump-todo' },
      { icon: teamIcon, label: '查看团队', action: 'jump-team' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', label: '进入审片', action: 'jump-review', minRole: 'editor' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', label: '同步照片', action: 'sync', minRole: 'editor' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', label: '下载备份', action: 'backup', minRole: 'admin' },
    ].filter(canUseShortcut);
    shortcutsEl.innerHTML = shortcuts
      .map(
        (s) => `
        <button class="shortcut-btn" data-shortcut="${escapeHtml(s.action)}" type="button" aria-label="${escapeHtml(s.label)}">
          <span class="shortcut-icon" aria-hidden="true">${s.icon}</span>
          <span class="shortcut-label">${escapeHtml(s.label)}</span>
        </button>
      `,
      )
      .join('');
  }
}

/**
 * 渲染环形数据图（素材分类统计）
 */
export function renderMediaChart() {
  const chartEl = document.getElementById('media-chart-container');
  if (!chartEl) return;

  const media = state.bootstrap?.media || [];
  const videoCount = media.filter((m) => m.kind === 'video').length;
  const photoCount = media.filter((m) => m.kind === 'photo').length;
  const total = media.length; // 与 hero 统计数字一致；弧长按真实占比绘制

  if (total === 0) {
    chartEl.innerHTML = '<div class="media-chart-empty">暂无素材数据</div>';
    return;
  }

  const videoPercent = (videoCount / total) * 100;
  const photoPercent = (photoCount / total) * 100;

  const radius = 70;
  const strokeWidth = 18;
  const center = 90;
  const circumference = 2 * Math.PI * radius;

  const videoDash = (videoPercent / 100) * circumference;
  const photoDash = (photoPercent / 100) * circumference;
  const videoOffset = 0;
  const photoOffset = -videoDash;

  chartEl.innerHTML = `
    <div class="media-chart-body">
      <div class="media-chart-svg-wrap">
        <svg class="media-chart-svg" viewBox="0 0 ${center * 2} ${center * 2}" aria-label="素材分类环形图">
          <circle class="media-chart-track" cx="${center}" cy="${center}" r="${radius}" fill="none" stroke-width="${strokeWidth}" />
          <circle class="media-chart-segment media-chart-segment--video" cx="${center}" cy="${center}" r="${radius}" fill="none" stroke-width="${strokeWidth}"
                  stroke-dasharray="${videoDash} ${circumference}" stroke-dashoffset="${videoOffset}"
                  style="--arc-start:${circumference}"
                  transform="rotate(-90 ${center} ${center})" stroke-linecap="round" />
          <circle class="media-chart-segment media-chart-segment--photo" cx="${center}" cy="${center}" r="${radius}" fill="none" stroke-width="${strokeWidth}"
                  stroke-dasharray="${photoDash} ${circumference}" stroke-dashoffset="${photoOffset}"
                  transform="rotate(-90 ${center} ${center})" stroke-linecap="round" />
        </svg>
        <div class="media-chart-center">
          <strong>${total}</strong>
          <span>素材总数</span>
        </div>
      </div>
      <ul class="media-chart-legend">
        <li><span class="legend-dot legend-dot--video" aria-hidden="true"></span><span>视频</span><strong>${videoCount}</strong></li>
        <li><span class="legend-dot legend-dot--photo" aria-hidden="true"></span><span>图片</span><strong>${photoCount}</strong></li>
      </ul>
    </div>
  `;
}

function formatStorageBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  return `${gb.toFixed(1)} GB`;
}

/**
 * 渲染存储空间容量条（素材盘已用 vs 剩余，横向进度条）
 */
export function renderStorageChart() {
  const chartEl = document.getElementById('storage-chart-container');
  if (!chartEl) return;

  const storage = state.bootstrap?.dashboard?.storage || {};
  if (storage.capacityAvailable == null || !storage.totalBytes) {
    chartEl.innerHTML = '<div class="media-chart-empty">暂无存储容量数据</div>';
    return;
  }

  const usedPercent = Math.min(100, Math.max(0, Number(storage.usedPercent || 0)));
  const tone = usedPercent >= 90 ? 'danger' : (usedPercent >= 75 ? 'warning' : 'normal');

  chartEl.innerHTML = `
    <div class="storage-bar-body" data-tone="${tone}">
      <div class="storage-bar-head">
        <strong class="storage-bar-pct">${usedPercent}%</strong>
        <span>已用</span>
      </div>
      <div class="storage-bar-track" role="progressbar" aria-valuenow="${usedPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="素材盘已用 ${usedPercent}%">
        <div class="storage-bar-fill" style="width:${usedPercent}%"></div>
      </div>
      <ul class="media-chart-legend">
        <li><span class="legend-dot legend-dot--used" aria-hidden="true"></span><span>已用</span><strong>${formatStorageBytes(storage.usedBytes)}</strong></li>
        <li><span class="legend-dot legend-dot--free" aria-hidden="true"></span><span>剩余</span><strong>${formatStorageBytes(storage.freeBytes)}</strong></li>
      </ul>
      <p class="storage-chart-total">素材盘总容量 ${formatStorageBytes(storage.totalBytes)}</p>
    </div>
  `;
}

// 活动日志分页状态
const ACTIVITY_PER_PAGE = 5;
let activityPage = 1;
let activityFilter = 'all';
let activityEventsBound = false;

/** 登出时重置活动日志分页/筛选状态 */
export function resetDashboardState() {
  activityPage = 1;
  activityFilter = 'all';
  // 注意：activityEventsBound 不重置——DOM 持久，监听器只需绑一次
}

function getActivityType(item) {
  const title = (item.title || '').toLowerCase();
  const detail = (item.detail || '').toLowerCase();
  const source = `${title} ${detail}`;
  if (/审核|审片|review/.test(source)) return 'review';
  if (/借出|借用|归还|borrow|return/.test(source)) return 'borrow';
  if (/素材|media|图片|视频|upload/.test(source)) return 'media';
  if (/设备|device/.test(source)) return 'device';
  if (/成员|团队|team|用户|user/.test(source)) return 'member';
  return 'system';
}

function getActivityTypeLabel(type) {
  const labels = {
    media: '素材',
    device: '设备',
    borrow: '借用',
    review: '审核',
    member: '成员',
    system: '系统',
  };
  return labels[type] || labels.system;
}

function filterActivity(items) {
  if (activityFilter === 'all') return items;
  return items.filter(item => getActivityType(item) === activityFilter);
}

/**
 * 渲染最近动态（翻页模式）
 */
export function renderActivity() {
  const allActivity = state.bootstrap?.activity || [];
  const filtered = filterActivity(allActivity);
  const totalPages = Math.ceil(filtered.length / ACTIVITY_PER_PAGE) || 1;
  // clamp page to valid range
  if (activityPage > totalPages) activityPage = totalPages;
  if (activityPage < 1) activityPage = 1;

  const start = (activityPage - 1) * ACTIVITY_PER_PAGE;
  const paged = filtered.slice(start, start + ACTIVITY_PER_PAGE);

  if (els.activityList) {
    els.activityList.setAttribute('aria-busy', 'true');
    const html = paged.length
      ? paged
        .map(
          (item) => {
            const type = getActivityType(item);
            const typeLabel = getActivityTypeLabel(type);
            return `
              <div class="time-item" data-activity-type="${escapeHtml(type)}" aria-label="${escapeHtml(typeLabel)}动态：${escapeHtml(item.title || '')}">
                <span class="time-dot" aria-hidden="true"></span>
                <div class="time-body">
                  <span class="time-tag">${escapeHtml(typeLabel)}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  <span class="time-meta">${escapeHtml(item.meta || '')}</span>
                  <span class="time-detail">${escapeHtml(item.detail || '')}</span>
                </div>
              </div>
            `;
          },
        )
        .join('')
      : '<div class="empty-state">暂无动态</div>';
    requestAnimationFrame(() => {
      els.activityList.style.opacity = '0';
      els.activityList.innerHTML = html;
      requestAnimationFrame(() => {
        els.activityList.style.transition = 'opacity 0.18s ease';
        els.activityList.style.opacity = '1';
        els.activityList.setAttribute('aria-busy', 'false');
      });
    });
  }

  updateActivityPagination(filtered.length, totalPages);
}

/**
 * 更新翻页控件状态
 */
function updateActivityPagination(totalCount, totalPages) {
  const pagination = document.getElementById('activity-pagination');
  if (!pagination) return;

  if (totalCount <= ACTIVITY_PER_PAGE) {
    pagination.hidden = true;
    return;
  }

  pagination.hidden = false;
  const prevBtn = pagination.querySelector('.pagination__prev');
  const nextBtn = pagination.querySelector('.pagination__next');
  const info = pagination.querySelector('.pagination__info');

  if (prevBtn) prevBtn.disabled = activityPage <= 1;
  if (nextBtn) nextBtn.disabled = activityPage >= totalPages;
  if (info) info.textContent = `第 ${activityPage} / ${totalPages} 页`;
}

/**
 * 初始化活动日志交互（筛选 + 翻页）
 */
export function initActivityFilters() {
  if (activityEventsBound) return;
  activityEventsBound = true;
  const filterRow = document.getElementById('activity-filters');
  if (filterRow) {
    filterRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-activity-filter]');
      if (!btn) return;
      filterRow.querySelectorAll('[data-activity-filter]').forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
      activityFilter = btn.dataset.activityFilter;
      activityPage = 1;
      renderActivity();
    });
  }

  const pagination = document.getElementById('activity-pagination');
  if (pagination) {
    pagination.addEventListener('click', (e) => {
      const prev = e.target.closest('.pagination__prev');
      const next = e.target.closest('.pagination__next');
      if (prev && !prev.disabled) {
        activityPage--;
        renderActivity();
      }
      if (next && !next.disabled) {
        activityPage++;
        renderActivity();
      }
    });
  }
}
