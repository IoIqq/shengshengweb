/**
 * Dashboard（工作台概览）模块
 * 负责首页统计数据、今日重点、快捷操作和最近动态的渲染
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, formatDatetime } from '../utils/helpers.js';
import { todoDayKey, classifyTodoByDate, formatDueLabel } from './todo.js';
import { isOverdue } from './borrow.js';

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

  // 更新日期时间徽章
  const dateBadge = document.getElementById('overview-date-badge');
  if (dateBadge) {
    const now = new Date();
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    const monthDay = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    dateBadge.innerHTML = `<span class="date-day">${weekday}</span><span class="date-md">${monthDay}</span><span class="date-time">${time}</span>`;
  }

  // 提醒徽章
  const alertsEl = document.getElementById('overview-alerts');
  if (alertsEl) {
    const overdueCount = (state.borrowCatalog || []).filter(
      (b) => b.status === 'approved' && isOverdue(b.expectedReturnAt, b.returnStatus)
    ).length;
    const alerts = [
      { tone: 'pending', value: counts.pending ?? 0, label: '待审素材', target: 'review' },
      { tone: 'todo', value: counts.todoOpen ?? 0, label: '未完待办', target: 'todo' },
      { tone: 'danger', value: overdueCount, label: '逾期借出', target: 'borrow' },
    ];
    alertsEl.innerHTML = alerts
      .map(
        (a) => `
        <button class="alert-chip" data-jump="${escapeHtml(a.target)}" data-tone="${escapeHtml(a.tone)}" type="button" ${a.value > 0 ? 'data-active="true"' : ''}>
          <span class="alert-value">${escapeHtml(a.value)}</span>
          <span class="alert-label">${escapeHtml(a.label)}</span>
          ${a.value > 0 ? '<span class="alert-pulse" aria-hidden="true"></span>' : ''}
        </button>
      `,
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
        (item, idx) => `
          <li data-jump="${escapeHtml(item.jump)}" data-tone="${escapeHtml(item.tone)}" tabindex="0" role="button" aria-label="跳转到${escapeHtml(item.label)}" style="--stat-index:${idx}">
            <strong>${escapeHtml(item.value)}</strong>
            <span>${escapeHtml(item.label)}</span>
            ${item.value > 0 && (item.tone === 'warning' || item.tone === 'primary') ? '<span class="stat-dot" aria-hidden="true"></span>' : ''}
          </li>
        `,
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
      <article class="focus-card" data-tone="warning">
        <div class="focus-head">
          <p class="eyebrow">最新待审</p>
          <button class="focus-link" data-jump="review" type="button">全部 →</button>
        </div>
        <div class="focus-body">
          ${
  pendingMedia.length
    ? pendingMedia
      .map(
        (m) => `
                <div class="focus-row">
                  <img class="focus-thumb" src="${escapeHtml(m.thumb || '')}" alt="" loading="lazy" />
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
      </article>
      <article class="focus-card" data-tone="${focusTodoTone}">
        <div class="focus-head">
          <p class="eyebrow">${overdueTodos.length ? `逾期 ${overdueTodos.length} 项` : (todayTodos.length ? '今日截止' : '未完成待办')}</p>
          <button class="focus-link" data-jump="todo" type="button">全部 →</button>
        </div>
        <div class="focus-body">
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
      </article>
      <article class="focus-card" data-tone="primary">
        <div class="focus-head">
          <p class="eyebrow">即将归还</p>
          <button class="focus-link" data-jump="borrow" type="button">全部 →</button>
        </div>
        <div class="focus-body">
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
      </article>
    `;
  }

  // 快捷操作区
  renderShortcuts();

  // 最近动态
  renderActivity();
}

/**
 * 渲染快捷操作
 */
export function renderShortcuts() {
  const shortcutsEl = document.getElementById('overview-shortcuts');
  if (shortcutsEl && !shortcutsEl.dataset.bound) {
    const shortcuts = [
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>', label: '上传素材', action: 'upload' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', label: '进入审片', action: 'jump-review' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16" r="1"/></svg>', label: '添加待办', action: 'jump-todo' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>', label: '登记设备', action: 'jump-device' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', label: '同步照片', action: 'sync' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', label: '下载备份', action: 'backup' },
    ];
    shortcutsEl.innerHTML = shortcuts
      .map(
        (s, idx) => `
        <button class="shortcut-btn" data-shortcut="${escapeHtml(s.action)}" type="button" style="--idx:${idx}">
          <span class="shortcut-icon" aria-hidden="true">${s.icon}</span>
          <span class="shortcut-label">${escapeHtml(s.label)}</span>
        </button>
      `,
      )
      .join('');
    shortcutsEl.dataset.bound = '1';
  }
}

// 活动日志分页状态
const ACTIVITY_PAGE_SIZE = 20;
let activityPage = 1;
let activityFilter = 'all';

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

function getActivityDotColor(type) {
  const colors = {
    media: '#3b82f6',
    device: '#10b981',
    borrow: '#14b8a6',
    review: '#f59e0b',
    member: '#8b5cf6',
    system: '#6b7280',
  };
  return colors[type] || colors.system;
}

function filterActivity(items) {
  if (activityFilter === 'all') return items;
  return items.filter(item => getActivityType(item) === activityFilter);
}

/**
 * 渲染最近动态
 */
export function renderActivity() {
  const allActivity = state.bootstrap?.activity || [];
  const filtered = filterActivity(allActivity);
  const paged = filtered.slice(0, activityPage * ACTIVITY_PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  if (els.activityList) {
    els.activityList.setAttribute('aria-busy', 'true');
    const html = paged.length
      ? `<ol class="timeline">${paged
        .map(
          (item, idx) => {
            const type = getActivityType(item);
            const dotColor = getActivityDotColor(type);
            return `
              <li class="timeline-item" style="--idx:${idx}" tabindex="-1">
                <span class="timeline-dot" aria-hidden="true" style="background:${dotColor}"></span>
                <article class="activity-item" data-activity-type="${escapeHtml(type)}">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.meta || '')}</p>
                  <small>${escapeHtml(item.detail || '')}</small>
                </article>
              </li>
            `;
          },
        )
        .join('')}</ol>`
      : '<div class="empty-state">暂无动态</div>';
    requestAnimationFrame(() => {
      els.activityList.innerHTML = html;
      els.activityList.setAttribute('aria-busy', 'false');
    });
  }

  const loadMore = document.getElementById('activity-load-more');
  if (loadMore) {
    loadMore.hidden = !hasMore;
  }
}

/**
 * 初始化活动日志交互
 */
export function initActivityFilters() {
  const filterRow = document.getElementById('activity-filters');
  if (filterRow) {
    filterRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-activity-filter]');
      if (!btn) return;
      filterRow.querySelectorAll('[data-activity-filter]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activityFilter = btn.dataset.activityFilter;
      activityPage = 1;
      renderActivity();
    });
  }

  const loadMoreBtn = document.getElementById('activity-load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const previousCount = Math.max(0, activityPage * ACTIVITY_PAGE_SIZE);
      activityPage++;
      renderActivity();
      setTimeout(() => {
        const nextItem = els.activityList?.querySelectorAll('.timeline-item')?.[previousCount];
        nextItem?.focus?.();
      }, 80);
    });
  }
}
