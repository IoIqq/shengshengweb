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
                  <span class="focus-icon" aria-hidden="true">📦</span>
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
      { icon: '📤', label: '上传素材', action: 'upload' },
      { icon: '✓', label: '进入审片', action: 'jump-review' },
      { icon: '📋', label: '添加待办', action: 'jump-todo' },
      { icon: '📦', label: '登记设备', action: 'jump-device' },
      { icon: '🔄', label: '同步照片', action: 'sync' },
      { icon: '⬇', label: '下载备份', action: 'backup' },
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

/**
 * 渲染最近动态
 */
export function renderActivity() {
  const activity = state.bootstrap?.activity || [];
  if (els.activityList) {
    els.activityList.innerHTML = activity.length
      ? `<ol class="timeline">${activity
        .map(
          (item, idx) => `
              <li class="timeline-item" style="--idx:${idx}">
                <span class="timeline-dot" aria-hidden="true"></span>
                <article class="activity-item">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.meta || '')}</p>
                  <small>${escapeHtml(item.detail || '')}</small>
                </article>
              </li>
            `,
        )
        .join('')}</ol>`
      : '<div class="empty-state">暂无动态</div>';
  }
}
