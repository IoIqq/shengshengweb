/**
 * 角色与视图访问控制
 *
 * 集中管理：当前角色判定、各类操作权限、视图可见性（VIEW_ROLES）、
 * 首个可访问视图，以及根据角色应用导航/按钮可见性。
 */

import { state } from './state.js';
import { els } from './dom.js';
import { $$, currentRole } from '../utils/helpers.js';
import { updateNavIndicator } from '../ui/navigation.js';

// 从 helpers 重导出，保持向后兼容
export { currentRole };

/**
 * 角色中文标签
 * @param {string} role
 * @returns {string}
 */
export function roleLabel(role) {
  return { admin: '管理员', editor: '编辑者', guest: '访客' }[role] || '成员';
}

/**
 * 角色工作台标签
 * @param {string} role
 * @returns {string}
 */
export function roleWorkspaceLabel(role) {
  return { admin: '管理员工作台', editor: '编辑者工作台', guest: '访客工作台' }[role] || '成员工作台';
}

export function canManageMedia() {
  return ['admin', 'editor'].includes(currentRole());
}

export function canUploadMedia() {
  return ['admin', 'editor', 'guest'].includes(currentRole());
}

export function canManageDevices() {
  return currentRole() === 'admin';
}

// 需要特定角色才能访问的视图
export const VIEW_ROLES = {
  review: ['admin', 'editor'],
  topics: ['admin', 'editor'],
  settings: ['admin'],
};

/**
 * 当前角色是否可访问指定视图
 * @param {string} view
 * @returns {boolean}
 */
export function canAccessView(view) {
  const roles = VIEW_ROLES[view];
  return !roles || roles.includes(currentRole());
}

/**
 * 当前角色下第一个可访问的视图
 * @returns {string}
 */
export function firstAccessibleView() {
  const firstVisibleChip = $$('.nav-chip').find((chip) => !chip.hidden && canAccessView(chip.dataset.view));
  return firstVisibleChip?.dataset.view || 'overview';
}

/**
 * 根据当前角色应用导航项、管理员专属区域和工具按钮的可见性
 */
export function applyRoleVisibility() {
  const isAdmin = currentRole() === 'admin';

  document.querySelectorAll('[data-admin-only="true"]').forEach((element) => {
    element.hidden = !isAdmin;
    element.classList.toggle('hidden', !isAdmin);
  });

  $$('.nav-chip').forEach((chip) => {
    const visible = canAccessView(chip.dataset.view);
    chip.hidden = !visible;
    chip.classList.toggle('hidden', !visible);
  });

  if (els.uploadBtn) {
    els.uploadBtn.hidden = !canUploadMedia();
    els.uploadBtn.classList.toggle('hidden', !canUploadMedia());
  }

  if (els.syncBtn) {
    const canSync = canManageMedia();
    els.syncBtn.hidden = !canSync;
    els.syncBtn.classList.toggle('hidden', !canSync);
  }

  if (!canAccessView(state.activeView)) {
    state.activeView = firstAccessibleView();
  }

  requestAnimationFrame(() => updateNavIndicator());
}
