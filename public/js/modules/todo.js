/**
 * 待办事项管理模块
 * 负责待办的渲染、分类、CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending } from '../ui/feedback.js';

/**
 * 获取日期的 day key（用于日期比较）
 * @param {Date} d - 日期对象
 * @returns {number}
 */
export function todoDayKey(d) {
  return new Date(d).setHours(0, 0, 0, 0);
}

/**
 * 根据截止日期分类待办
 * @param {Object} todo - 待办对象
 * @param {number} todayKey - 今天的 day key
 * @returns {string} - 分类 (overdue, today, this-week, later, done)
 */
export function classifyTodoByDate(todo, todayKey) {
  if (todo.done) return 'done';
  if (!todo.dueDate) return 'later';
  const due = todoDayKey(`${todo.dueDate}T00:00:00`);
  const diffDays = Math.round((due - todayKey) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 6) return 'this-week';
  return 'later';
}

/**
 * 格式化截止日期标签
 * @param {Object} todo - 待办对象
 * @param {number} todayKey - 今天的 day key
 * @returns {string}
 */
export function formatDueLabel(todo, todayKey) {
  if (!todo.dueDate) return '未排期';
  const due = todoDayKey(`${todo.dueDate}T00:00:00`);
  const diffDays = Math.round((due - todayKey) / 86400000);
  if (diffDays < 0) return `已逾期 ${-diffDays} 天`;
  if (diffDays === 0) return '今日截止';
  if (diffDays === 1) return '明天截止';
  if (diffDays <= 6) return `${diffDays} 天后截止`;
  const dt = new Date(`${todo.dueDate}T00:00:00`);
  return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日截止`;
}

/**
 * 获取负责人姓名
 * @param {string} assigneeId - 负责人 ID
 * @returns {string|null}
 */
export function getAssigneeName(assigneeId) {
  if (!assigneeId) return null;
  const team = state.bootstrap?.team || [];
  const member = team.find((m) => m.id === assigneeId);
  return member ? member.name : null;
}

/**
 * 同步待办负责人选项
 */
export function syncTodoAssigneeOptions() {
  if (!els.todoAssigneeSelect) return;
  const team = state.bootstrap?.team || [];
  const current = els.todoAssigneeSelect.value;
  els.todoAssigneeSelect.innerHTML =
    '<option value="">未分配</option>' +
    team
      .map(
        (m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`,
      )
      .join('');
  if (current && team.some((m) => m.id === current)) {
    els.todoAssigneeSelect.value = current;
  }
}

/**
 * 渲染待办事项列表
 */
export function renderTodos() {
  const items = state.bootstrap?.todos || [];
  syncTodoAssigneeOptions();
  const openCount = items.filter((item) => !item.done).length;
  if (els.todoOpenCount) els.todoOpenCount.textContent = `${openCount} 项未完成`;
  if (!els.todoList) return;

  if (!items.length) {
    els.todoList.innerHTML = '<div class="empty-state">暂时没有待办事项</div>';
    return;
  }

  const todayKey = todoDayKey(new Date());
  const groups = { overdue: [], today: [], 'this-week': [], later: [], done: [] };
  items.forEach((it) => {
    groups[classifyTodoByDate(it, todayKey)].push(it);
  });

  // 组内排序
  const byDueAsc = (a, b) => {
    const ad = a.dueDate || '9999-12-31';
    const bd = b.dueDate || '9999-12-31';
    return ad.localeCompare(bd);
  };
  groups.overdue.sort(byDueAsc); // 最久逾期在前
  groups.today.sort(byDueAsc);
  groups['this-week'].sort(byDueAsc);
  groups.later.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  groups.done.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const groupMeta = [
    { key: 'overdue', label: '逾期', tone: 'overdue' },
    { key: 'today', label: '今日截止', tone: 'today' },
    { key: 'this-week', label: '本周内', tone: '' },
    { key: 'later', label: '以后 / 未排期', tone: '' },
    { key: 'done', label: '已完成', tone: 'done' },
  ];

  const team = state.bootstrap?.team || [];
  const renderEditCard = (item) => {
    const assigneeOpts =
      '<option value="">未分配</option>' +
      team
        .map(
          (m) =>
            `<option value="${escapeHtml(m.id)}" ${item.assigneeId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
        )
        .join('');
    const priorityOpts = ['高', '中', '低']
      .map(
        (p) =>
          `<option value="${p}" ${item.priority === p ? 'selected' : ''}>${p}优先</option>`,
      )
      .join('');
    return `
      <article class="todo-item todo-item--editing" data-todo-id="${escapeHtml(item.id)}">
        <form class="todo-edit-form" data-todo-edit-form="${escapeHtml(item.id)}">
          <label class="field">
            <span>标题</span>
            <input name="title" type="text" value="${escapeHtml(item.title)}" required data-todo-edit-focus />
          </label>
          <label class="field">
            <span>截止日期</span>
            <input name="dueDate" type="date" value="${escapeHtml(item.dueDate || '')}" />
          </label>
          <label class="field">
            <span>负责人</span>
            <select name="assigneeId">${assigneeOpts}</select>
          </label>
          <label class="field">
            <span>优先级</span>
            <select name="priority">${priorityOpts}</select>
          </label>
          <div class="todo-edit-actions">
            <button class="ghost-btn" type="button" data-todo-edit-cancel>取消</button>
            <button class="primary-btn" type="submit">保存</button>
          </div>
        </form>
      </article>
    `;
  };

  const renderCard = (item) => {
    if (state.todoEditingId === item.id) return renderEditCard(item);
    const assignee = getAssigneeName(item.assigneeId);
    const dueLabel = formatDueLabel(item, todayKey);
    const dueState =
      item.done ? 'done' : !item.dueDate ? 'none' : classifyTodoByDate(item, todayKey);
    return `
      <article class="todo-item ${item.done ? 'is-done' : ''}" data-todo-id="${escapeHtml(item.id)}">
        <label class="todo-check" data-todo-edit-skip>
          <input type="checkbox" data-todo-toggle="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} />
          <span></span>
        </label>
        <div class="todo-body">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="todo-meta">
            <span class="todo-meta-priority" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}优先</span>
            <span class="todo-meta-due" data-state="${escapeHtml(dueState)}">${escapeHtml(dueLabel)}</span>
            ${assignee ? `<span class="todo-assignee-chip">${escapeHtml(assignee)}</span>` : ''}
          </div>
        </div>
        <div class="todo-actions" data-todo-edit-skip>
          <button class="ghost-btn" data-todo-delete="${escapeHtml(item.id)}" type="button">删除</button>
        </div>
      </article>
    `;
  };

  const overdueCount = groups.overdue.length;
  const alertBar = overdueCount
    ? `<button class="todo-alert-bar" type="button" data-todo-alert>⚠ ${overdueCount} 项已逾期，点击查看</button>`
    : '';

  const sections = groupMeta
    .filter((g) => groups[g.key].length || g.key === 'today' || g.key === 'overdue')
    .map((g) => {
      const list = groups[g.key];
      if (!list.length && g.key !== 'overdue' && g.key !== 'today') return '';
      const collapsed = g.key === 'done' ? 'data-collapsed' : '';
      const tone = g.tone ? `data-tone="${g.tone}"` : '';
      const headerCount = list.length;
      return `
        <section class="todo-group" data-group="${g.key}" ${tone} ${collapsed}>
          <header class="todo-group-head">
            <h3>${g.label} <span class="todo-group-count">${headerCount}</span></h3>
          </header>
          <div class="todo-group-list">
            ${list.length ? list.map(renderCard).join('') : '<div class="todo-group-empty">无</div>'}
          </div>
        </section>
      `;
    })
    .join('');

  els.todoList.innerHTML = `
    <div class="todo-board">
      ${alertBar}
      ${sections}
    </div>
  `;

  if (state.todoEditingId) {
    const focusEl = els.todoList.querySelector('[data-todo-edit-focus]');
    if (focusEl) {
      focusEl.focus();
      if (typeof focusEl.select === 'function') focusEl.select();
    }
  }
}

/**
 * 创建待办事项
 * @param {FormData} formData - 表单数据
 */
export async function createTodo(formData) {
  const title = formData.get('title')?.trim();
  const dueDate = formData.get('dueDate') || null;
  const assigneeId = formData.get('assigneeId') || null;
  const priority = formData.get('priority') || '中';

  if (!title) {
    Toast.warning('请输入待办标题');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/todos', {
      method: 'POST',
      body: { title, dueDate, assigneeId, priority },
    });

    // 添加到本地状态
    if (state.bootstrap) {
      if (!Array.isArray(state.bootstrap.todos)) state.bootstrap.todos = [];
      state.bootstrap.todos.push(result.todo || result);
    }

    Toast.success('待办已添加');
    renderTodos();

    // 清空表单
    if (els.todoForm) els.todoForm.reset();
  } catch (error) {
    Toast.error(error.message || '添加失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 更新待办事项
 * @param {string} id - 待办 ID
 * @param {Object} updates - 更新数据
 */
export async function updateTodo(id, updates) {
  try {
    setPending(true);
    const result = await requestJSON(`/api/todos/${id}`, {
      method: 'PATCH',
      body: updates,
    });

    // 更新本地状态
    const todos = state.bootstrap?.todos || [];
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      Object.assign(todo, result.todo || updates);
    }

    Toast.success('待办已更新');
    state.todoEditingId = null;
    renderTodos();
    return result;
  } catch (error) {
    Toast.error(error.message || '更新失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 切换待办完成状态
 * @param {string} id - 待办 ID
 */
export async function toggleTodo(id) {
  const todos = state.bootstrap?.todos || [];
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  const done = !todo.done;

  try {
    await updateTodo(id, {
      done,
      completedAt: done ? new Date().toISOString() : null
    });
  } catch (error) {
    // 错误已在 updateTodo 中处理
  }
}

/**
 * 删除待办事项
 * @param {string} id - 待办 ID
 */
export async function deleteTodo(id) {
  const confirmed = await Dialog.confirm({
    title: '删除待办',
    message: '确定要删除这个待办吗？',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) {
    return;
  }

  try {
    setPending(true);
    await requestJSON(`/api/todos/${id}`, { method: 'DELETE' });

    // 从本地状态中移除
    if (state.bootstrap?.todos) {
      state.bootstrap.todos = state.bootstrap.todos.filter((t) => t.id !== id);
    }

    Toast.success('待办已删除');
    renderTodos();
  } catch (error) {
    Toast.error(error.message || '删除失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 开始编辑待办
 * @param {string} id - 待办 ID
 */
export function startEditTodo(id) {
  state.todoEditingId = id;
  renderTodos();
}

/**
 * 取消编辑待办
 */
export function cancelEditTodo() {
  state.todoEditingId = null;
  renderTodos();
}

/**
 * 保存编辑的待办
 * @param {string} id - 待办 ID
 * @param {FormData} formData - 表单数据
 */
export async function saveEditTodo(id, formData) {
  const title = formData.get('title')?.trim();
  const dueDate = formData.get('dueDate') || null;
  const assigneeId = formData.get('assigneeId') || null;
  const priority = formData.get('priority') || '中';

  if (!title) {
    Toast.warning('请输入待办标题');
    return;
  }

  await updateTodo(id, { title, dueDate, assigneeId, priority });
}
