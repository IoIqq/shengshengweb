/**
 * 用户管理模块
 */

import { request } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { createSkeleton } from '../ui/loading.js';
import { escapeHtml } from '../utils/helpers.js';

let currentUsers = [];
let currentRegistrationRequests = [];
let isLoading = false;
let isRegistrationLoading = false;
let roleFilter = 'all';

/**
 * 初始化用户管理
 */
export function initUsers() {
  loadUsers();
  loadRegistrationRequests();
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
    const container = document.getElementById('user-list');
    if (container) container.innerHTML = `<p class="empty-state">加载失败：${escapeHtml(error.message || '请稍后重试')}</p>`;
  }
}

async function loadRegistrationRequests() {
  try {
    isRegistrationLoading = true;
    renderRegistrationRequestList([]);

    const { requests } = await request('/api/registration-requests?status=pending');
    currentRegistrationRequests = requests || [];
    isRegistrationLoading = false;
    renderRegistrationRequestList(currentRegistrationRequests);
  } catch (error) {
    isRegistrationLoading = false;
    console.error('加载注册申请失败：', error);
    Toast.error(error.message || '加载注册申请失败');
    const container = document.getElementById('registration-request-list');
    if (container) container.innerHTML = `<p class="empty-state">加载失败：${escapeHtml(error.message || '请稍后重试')}</p>`;
  }
}

function renderRegistrationRequestList(requests) {
  const container = document.getElementById('registration-request-list');
  if (!container) return;

  if (isRegistrationLoading) {
    container.innerHTML = createSkeleton('list', 3);
    return;
  }

  if (!requests.length) {
    container.innerHTML = '<p class="empty-state">暂无待审核申请</p>';
    return;
  }

  container.innerHTML = requests.map(createRegistrationRequestCard).join('');

  container.querySelectorAll('.registration-request-card').forEach((card) => {
    const request = currentRegistrationRequests.find((item) => item.id === card.dataset.requestId);
    if (!request) return;

    card.querySelector('[data-action="approve-registration"]')?.addEventListener('click', () => {
      showRegistrationApprovalDialog(request);
    });

    card.querySelector('[data-action="reject-registration"]')?.addEventListener('click', () => {
      rejectRegistrationRequest(request);
    });
  });
}

function createRegistrationRequestCard(request) {
  const createdAt = request.createdAt ? new Date(request.createdAt).toLocaleString('zh-CN') : '未知时间';
  return `
    <div class="registration-request-card" data-request-id="${escapeHtml(request.id)}">
      <div class="registration-request-main">
        <div>
          <strong>${escapeHtml(request.displayName || request.username)}</strong>
          <span class="user-role-badge guest">待审核</span>
        </div>
        <small>申请账号：${escapeHtml(request.username)}</small>
        <small>联系方式：${escapeHtml(request.contact)}</small>
        <p>${escapeHtml(request.reason)}</p>
        <small>提交时间：${createdAt}</small>
      </div>
      <div class="user-actions">
        <button class="primary-btn" data-action="approve-registration" type="button">通过</button>
        <button class="ghost-btn danger" data-action="reject-registration" type="button">拒绝</button>
      </div>
    </div>
  `;
}

/**
 * 渲染用户列表
 */
function renderUserList(users) {
  const container = document.getElementById('user-list');
  if (!container) return;

  // 显示骨架屏
  if (isLoading || !users || (users.length === 0 && isLoading)) {
    container.innerHTML = createSkeleton('list', 5);
    return;
  }

  const filteredUsers = roleFilter === 'all' ? users : users.filter((user) => user.role === roleFilter);

  if (users.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无用户</p>';
    return;
  }

  container.innerHTML = `
    <div class="user-filter-row" role="group" aria-label="按角色筛选用户">
      ${[
    ['all', '全部'],
    ['admin', '管理员'],
    ['editor', '编辑'],
    ['guest', '访客'],
  ].map(([value, label]) => `<button class="filter-chip ${roleFilter === value ? 'is-active' : ''}" data-user-role-filter="${value}" type="button" aria-pressed="${roleFilter === value}">${label}</button>`).join('')}
    </div>
    <div class="user-card-list">
      ${filteredUsers.length ? filteredUsers.map((user) => createUserCard(user)).join('') : '<p class="empty-state">当前筛选下暂无用户</p>'}
    </div>
  `;

  container.querySelectorAll('[data-user-role-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      roleFilter = button.dataset.userRoleFilter;
      renderUserList(currentUsers);
    });
  });

  // 绑定用户卡片事件
  container.querySelectorAll('.user-card').forEach((card) => {
    const userId = card.dataset.userId;
    const user = users.find((u) => String(u.id) === String(userId));
    if (!user) return;

    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      showEditUserDialog(user);
    });

    card.querySelector('[data-action="toggle-status"]')?.addEventListener('click', () => {
      toggleUserStatus(user);
    });

    card.querySelector('[data-action="kick-sessions"]')?.addEventListener('click', () => {
      kickUserSessions(user);
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
    admin: '管',
    editor: '编',
    guest: '访',
  };

  const statusLabels = {
    active: '启用',
    disabled: '禁用',
  };

  const statusIcons = {
    active: '✓',
    disabled: '⊘',
  };

  const avatarInitial = escapeHtml(user.display_name
    ? user.display_name.charAt(0)
    : user.username.charAt(0).toUpperCase());

  const lastLogin = user.last_login_at
    ? new Date(user.last_login_at).toLocaleString('zh-CN')
    : '从未登录';

  const roleIcon = roleIcons[user.role] || '';
  const statusIcon = statusIcons[user.status] || '';
  const displayName = escapeHtml(user.display_name || user.username);
  const username = escapeHtml(user.username);
  const role = escapeHtml(user.role);
  const status = escapeHtml(user.status);

  return `
    <div class="user-card" data-user-id="${user.id}">
      <div class="user-avatar">
        ${avatarInitial}
      </div>
      <div class="user-info">
        <div>
          <strong>${displayName}</strong>
          <span class="user-role-badge ${role}">
            <span class="status-icon" aria-hidden="true">${roleIcon}</span>
            ${roleLabels[user.role] || role}
          </span>
          <span class="user-status-badge ${status}">
            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
            ${statusLabels[user.status] || status}
          </span>
        </div>
        <small>用户名：${username}</small>
        <small>最后登录：${lastLogin}</small>
      </div>
      <div class="user-actions">
        <button class="ghost-btn" data-action="edit" type="button" aria-label="编辑用户 ${username}">编辑</button>
        <button class="ghost-btn" data-action="toggle-status" type="button" aria-label="${user.status === 'active' ? '禁用' : '启用'}用户 ${username}">
          ${user.status === 'active' ? '禁用' : '启用'}
        </button>
        <button class="ghost-btn" data-action="kick-sessions" type="button" aria-label="强制下线用户 ${username}">强制下线</button>
        <button class="ghost-btn danger" data-action="delete" type="button" aria-label="删除用户 ${username}">删除</button>
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

  const registrationRefreshBtn = document.getElementById('registration-request-refresh');
  if (registrationRefreshBtn) {
    registrationRefreshBtn.addEventListener('click', loadRegistrationRequests);
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

  const bodyHtml = `
    <label class="field">
      <span>用户名</span>
      <input name="username" type="text" value="${escapeHtml(user?.username || '')}" required ${isEdit ? 'readonly' : ''} />
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
      <input name="displayName" type="text" value="${escapeHtml(user?.display_name || '')}" />
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
    ${
  isEdit
    ? `
      <label class="field">
        <span>重置密码</span>
        <input name="password" type="password" minlength="6" maxlength="100" placeholder="不修改请留空" autocomplete="new-password" />
        <small>保存后，该用户需要使用新密码重新登录。</small>
      </label>
    `
    : ''
}
  `;

  Dialog.form({
    title,
    formId: 'user-dialog-form',
    bodyHtml,
    onSubmit: async (data) => {
      if (isEdit && !data.password) delete data.password;
      await onSubmit(data);
      loadUsers();
    },
  });
}

function showRegistrationApprovalDialog(registrationRequest) {
  const bodyHtml = `
    <label class="field">
      <span>用户名</span>
      <input name="username" type="text" value="${escapeHtml(registrationRequest.username)}" readonly />
    </label>
    <label class="field">
      <span>显示名称</span>
      <input name="displayName" type="text" value="${escapeHtml(registrationRequest.displayName || registrationRequest.username)}" maxlength="50" />
    </label>
    <label class="field">
      <span>角色</span>
      <select name="role" required>
        <option value="guest" selected>访客</option>
        <option value="editor">编辑</option>
        <option value="admin">管理员</option>
      </select>
    </label>
    <label class="field">
      <span>初始密码</span>
      <input name="password" type="password" required minlength="6" maxlength="100" autocomplete="new-password" />
      <small>通过后，请把初始密码线下告知申请人。</small>
    </label>
  `;

  Dialog.form({
    title: '通过注册申请',
    formId: 'registration-approval-form',
    bodyHtml,
    submitText: '通过并创建账号',
    onSubmit: async (data) => {
      await request(`/api/registration-requests/${registrationRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'approve',
          role: data.role,
          password: data.password,
          displayName: data.displayName,
        }),
      });
      Toast.success('注册申请已通过，账号已创建');
      loadRegistrationRequests();
      loadUsers();
    },
  });
}

async function rejectRegistrationRequest(registrationReq) {
  const reason = await Dialog.prompt({
    title: '拒绝注册申请',
    message: `请输入拒绝 ${registrationReq.username} 的原因：`,
    defaultValue: '申请信息不完整',
    placeholder: '请输入拒绝原因',
    confirmText: '确认拒绝',
    cancelText: '取消',
    required: true,
  });

  if (reason === null) return;

  try {
    await request(`/api/registration-requests/${registrationReq.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'reject',
        rejectReason: reason,
      }),
    });
    Toast.success('注册申请已拒绝');
    loadRegistrationRequests();
  } catch (error) {
    console.error('拒绝注册申请失败：', error);
    Toast.error(error.message || '拒绝注册申请失败');
  }
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
 * 强制下线：清除该用户所有登录 session
 */
async function kickUserSessions(user) {
  const confirmed = await Dialog.confirm({
    title: '强制下线',
    message: `确定要强制下线用户 ${user.username} 吗？其所有登录会话将立即失效。`,
    confirmText: '强制下线',
    cancelText: '取消',
    variant: 'warning',
  });
  if (!confirmed) return;
  try {
    await request(`/api/users/${user.id}/sessions`, { method: 'DELETE' });
    Toast.success(`用户 ${user.username} 已被强制下线`);
  } catch (error) {
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
