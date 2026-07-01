/**
 * 工具函数模块
 * 提供通用的辅助函数
 */

import { state } from '../core/state.js';

// DOM 查询
export function $(root, selector) {
  return root ? root.querySelector(selector) : null;
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

// 时间格式化
export function nowText() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDatetime(value) {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 文本处理
export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getInitials(name) {
  const text = String(name || '').trim();
  if (!text) return '工';
  return text.slice(0, 1).toUpperCase();
}

export function getRoleLabel(role) {
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑者';
  if (role === 'guest') return '访客';
  return '成员';
}

// 防抖函数
let _debounceSeq = 0;
export function debounce(fn, delay, key) {
  const timers = window._debounceTimers || (window._debounceTimers = {});
  // 未指定 key 时，为每个 debounce 实例分配独立 key，避免互相取消
  const slot = key || `_d${++_debounceSeq}`;
  return function (...args) {
    clearTimeout(timers[slot]);
    timers[slot] = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 列表响应规范化
export function normalizeListResponse(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

// 角色与权限
export function currentRole() {
  return state.session?.user?.role || state.bootstrap?.user?.role || '';
}

export function isAdminUser() {
  return currentRole() === 'admin';
}

// HTML 安全文本
export function safeText(value) {
  return escapeHtml(String(value ?? ''));
}

// 本地活动记录（无需服务器的即时反馈）
export function addLocalActivity(title, detail) {
  if (!state.bootstrap) state.bootstrap = {};
  if (!Array.isArray(state.bootstrap.activity)) state.bootstrap.activity = [];
  state.bootstrap.activity.unshift({
    id: `local-${Date.now()}`,
    title,
    meta: state.session?.user?.username || '本地操作',
    detail,
    createdAt: new Date().toISOString(),
  });
  document.dispatchEvent(new CustomEvent('activity-updated'));
}

// 暴露到全局（向后兼容）
window.shengshengUtils = {
  ...(window.shengshengUtils || {}),
  escapeHtml,
};
