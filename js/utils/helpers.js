/**
 * 工具函数模块
 * 提供通用的辅助函数
 */

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
  if (role === 'member') return '成员';
  return '访客';
}

// 防抖函数
export function debounce(fn, delay, key = 'default') {
  const timers = window._debounceTimers || (window._debounceTimers = {});
  return function (...args) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 列表响应规范化
export function normalizeListResponse(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

// 暴露到全局（向后兼容）
window.shengshengUtils = {
  ...(window.shengshengUtils || {}),
  escapeHtml,
};
