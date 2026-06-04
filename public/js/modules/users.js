/**
 * 用户管理模块
 */

import { request } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { createSkeleton } from '../ui/loading.js';

let currentUsers = [];
let isLoading = false;

/**
 * 初始化用户管理
 */
export function initUsers() {
  loadUsers();
  bindUserEvents();
}

/**
 * 加载用户列表
 */
export async function loadUsers() {
  try {
    isLoading = true;
    renderUserList([]); // 显示骨架屏

    const { users } = await request('/api/users');
    currentUsers = users;
    isLoading = false;
    renderUserList(users);
  } catch (error) {
    isLoading = false;
    console.error('加载用户列表失败：', error);
    Toast.error(error.message || '加载用户列表失败');
  }
}

/**
 * 渲染用户列表
 */
function renderUserList(users) {
  const container = document.getElementById('user-list');
  if (!container) return;

  // 显示骨架屏
  if (isLoading || !users || users.length === 0 && isLoading) {
    container.innerHTML = createSkeleton('list', 5);
    return;
  }

  if (users.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无用户</p>';
    return;
  }

  container.innerHTML = users
    .map((user) => createUserCard(user))
    .join('');

  // 绑定用户卡片事件
  container.querySelectorAll('.user-card').forEach((card) => {
    const userId = card.dataset.userId;
    const user = users.find((u) => u.id === parseInt(userId));
    if (!user) return;

    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      showEditUserDialog(user);
    });

    card.querySelector('[data-action="toggle-status"]')?.addEventListener('click', () => {
      toggleUserStatus(user);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      deleteUser(user);
    });
  });
}

/**
 * 创建用户卡片HTML
 */
function createUserCard(user) {
  const roleLabels = {
    admin: '管理员',
    editor: '编辑',
    guest: '访客',
  };

  const roleIcons = {
    admin: '👑',
    editor: '✏️',
    guest: '👤',
  };

  const statusLabels = {
    active: '启用',
    disabled: '禁用',
  };

  const statusIcons = {
    active: '✓',
    disabled: '⊘',
  };

  const avatarInitial = user.display_name
    ? user.display_name.charAt(0)
    : user.username.charAt(0).toUpperCase();

  const lastLogin = user.last_login_at
    ? new Date(user.last_login_at).toLocaleString('zh-CN')
    : '从未登录';

  const roleIcon = roleIcons[user.role] || '';
  const statusIcon = statusIcons[user.status] || '';

  return `
    <div class="user-card" data-user-id="${user.id}">
      <div class="user-avatar">
        ${avatarInitial}
      </div>
      <div class="user-info">
        <div>
          <strong>${user.display_name || user.username}</strong>
          <span class="user-role-badge ${user.role}">
            <span class="status-icon" aria-hidden="true">${roleIcon}</span>
            ${roleLabels[user.role] || user.role}
          </span>
          <span class="user-status-badge ${user.status}">
            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
            ${statusLabels[user.status] || user.status}
          </span>
        </div>
        <small>用户名：${user.username}</small>
        <small>最后登录：${lastLogin}</small>
      </div>
      <div class="user-actions">
        <button class="ghost-btn" data-action="edit" type="button">编辑</button>
        <button class="ghost-btn" data-action="toggle-status" type="button">
          ${user.status === 'active' ? '禁用' : '启用'}
        </button>
        <button class="ghost-btn danger" data-action="delete" type="button">删除</button>
      </div>
    </div>
  `;
}

/**
 * 绑定用户管理事件
 */
function bindUserEvents() {
  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', showAddUserDialog);
  }
}

/**
 * 显示添加用户对话框
 */
function showAddUserDialog() {
  showUserDialog({
    title: '添加用户',
    user: null,
    onSubmit: createUser,
  });
}

/**
 * 显示编辑用户对话框
 */
function showEditUserDialog(user) {
  showUserDialog({
    title: '编辑用户',
    user,
    onSubmit: (data) => updateUser(user.id, data),
  });
}

/**
 * 显示用户对话框
 */
function showUserDialog({ title, user, onSubmit }) {
  const isEdit = !!user;

  const dialog = document.createElement('div');
  dialog.className = 'user-dialog';
  dialog.innerHTML = `
    <div class="user-dialog-content">
      <div class="user-dialog-header">
        <h3>${title}</h3>
        <button class="user-dialog-close" type="button">&times;</button>
      </div>
      <form class="user-dialog-form" id="user-dialog-form">
        <label class="field">
          <span>用户名</span>
          <input name="username" type="text" value="${user?.username || ''}" required ${isEdit ? 'readonly' : ''} />
        </label>
        ${
          !isEdit
            ? `
          <label class="field">
            <span>密码</span>
            <input name="password" type="password" required minlength="6" maxlength="100" />
          </label>
        `
            : ''
        }
        <label class="field">
          <span>显示名称</span>
          <input name="displayName" type="text" value="${user?.display_name || ''}" />
        </label>
        <label class="field">
          <span>角色</span>
          <select name="role" required>
            <option value="guest" ${user?.role === 'guest' ? 'selected' : ''}>访客</option>
            <option value="editor" ${user?.role === 'editor' ? 'selected' : ''}>编辑</option>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>管理员</option>
          </select>
        </label>
        ${
          isEdit
            ? `
          <label class="field">
            <span>状态</span>
            <select name="status">
              <option value="active" ${user?.status === 'active' ? 'selected' : ''}>启用</option>
              <option value="disabled" ${user?.status === 'disabled' ? 'selected' : ''}>禁用</option>
            </select>
          </label>
        `
            : ''
        }
        <div class="user-dialog-actions">
          <button class="ghost-btn" type="button" data-action="cancel">取消</button>
          <button class="primary-btn" type="submit">保存</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(dialog);

  // 绑定事件
  const form = dialog.querySelector('#user-dialog-form');
  const closeBtn = dialog.querySelector('.user-dialog-close');
  const cancelBtn = dialog.querySelector('[data-action="cancel"]');

  const closeDialog = () => {
    dialog.remove();
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      await onSubmit(data);
      closeDialog();
      loadUsers();
    } catch (error) {
      console.error('操作失败：', error);
      Toast.error(error.message || '操作失败');
    }
  });
}

/**
 * 创建用户
 */
async function createUser(data) {
  await request('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  Toast.success('用户创建成功');
}

/**
 * 更新用户
 */
async function updateUser(userId, data) {
  await request(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  Toast.success('用户更新成功');
}

/**
 * 切换用户状态
 */
async function toggleUserStatus(user) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active';
  const action = newStatus === 'active' ? '启用' : '禁用';

  const confirmed = await Dialog.confirm({
    title: `${action}用户`,
    message: `确定要${action}用户 ${user.username} 吗？`,
    confirmText: action,
    cancelText: '取消',
    variant: newStatus === 'disabled' ? 'warning' : 'info'
  });

  if (!confirmed) return;

  try {
    await request(`/api/users/${user.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    Toast.success(`用户已${action}`);
    loadUsers();
  } catch (error) {
    console.error('操作失败：', error);
    Toast.error(error.message || '操作失败');
  }
}

/**
 * 删除用户
 */
async function deleteUser(user) {
  const confirmed = await Dialog.confirm({
    title: '删除用户',
    message: `确定要删除用户 ${user.username} 吗？此操作不可恢复。`,
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger'
  });

  if (!confirmed) return;

  try {
    await request(`/api/users/${user.id}`, {
      method: 'DELETE',
    });
    Toast.success('用户已删除');
    loadUsers();
  } catch (error) {
    console.error('删除失败：', error);
    Toast.error(error.message || '删除失败');
  }
}
