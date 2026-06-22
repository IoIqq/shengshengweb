/**
 * UI 反馈模块
 * 负责显示操作反馈、控制 Pending 状态和个人资料弹窗
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { $$ } from '../utils/helpers.js';
import { UI_CONSTANTS } from '../core/config.js';

const FEEDBACK_TTL = UI_CONSTANTS.FEEDBACK_TTL || 2400;
let feedbackTimer = null;
let profileFeedbackTimer = null;
let profileCloseTimer = null;
// 打开 popover 前的焦点元素：关闭后归还
let profilePreviousFocus = null;

/**
 * 显示面板反馈消息
 * @param {string} text - 反馈文本
 * @param {string} tone - 反馈色调 (info, success, warning, error)
 * @param {string} view - 视图名称，默认为当前视图
 */
export function showFeedback(text, tone = 'info', view = state.activeView) {
  const panel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
  if (!panel) return;

  let node = panel.querySelector('.panel-feedback');
  if (!node) {
    node = document.createElement('div');
    node.className = 'panel-feedback';
    panel.prepend(node);
  }

  node.dataset.tone = tone;
  node.textContent = text || '';

  clearTimeout(feedbackTimer);
  if (text) {
    feedbackTimer = window.setTimeout(() => {
      if (node.isConnected) {
        node.textContent = '';
        delete node.dataset.tone;
      }
    }, FEEDBACK_TTL);
  }
}

/**
 * 清除面板反馈消息
 * @param {string} view - 视图名称，默认为当前视图
 */
export function clearFeedback(view = state.activeView) {
  const panel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
  const node = panel?.querySelector('.panel-feedback');
  if (!node) return;

  node.textContent = '';
  delete node.dataset.tone;
}

/**
 * 设置操作 Pending 状态
 * @param {boolean} pending - 是否处于 pending 状态
 */
export function setPending(pending) {
  state.actionPending = pending;

  // 禁用/启用顶部按钮
  [
    els.refreshBtn,
    els.logoutBtn,
    els.uploadBtn,
    els.syncBtn,
    els.deviceRefreshBtn,
    els.borrowRefreshBtn,
    els.teamRefreshBtn
  ].forEach((btn) => {
    if (btn) btn.disabled = pending;
  });

  // 禁用/启用设置提交按钮
  if (els.settingsSubmitBtn) els.settingsSubmitBtn.disabled = pending;

  // 禁用/启用待办表单
  if (els.todoForm) {
    $$('button, input, select', els.todoForm).forEach((el) => {
      el.disabled = pending;
    });
  }

  // 禁用/启用设备表单
  if (els.deviceForm) {
    $$('button, input, select', els.deviceForm).forEach((el) => {
      el.disabled = pending;
    });
  }

  // 禁用/启用借出表单
  if (els.borrowForm) {
    $$('button, input, select', els.borrowForm).forEach((el) => {
      el.disabled = pending;
    });
  }

  // 禁用/启用团队表单
  if (els.teamForm) {
    $$('button, input, select', els.teamForm).forEach((el) => {
      el.disabled = pending;
    });
  }

  // 禁用/启用设置表单
  if (els.settingsForm) {
    $$('button, input, select', els.settingsForm).forEach((el) => {
      if (el !== els.settingsSubmitBtn) el.disabled = pending;
    });
  }
}

/**
 * 设置登录 Pending 状态
 * @param {boolean} pending - 是否处于 pending 状态
 */
export function setLoginPending(pending) {
  state.loginPending = pending;

  if (els.loginSubmit) {
    // 仅切换 disabled，由 CSS .login-submit[disabled] 接管 spinner 显示
    // 不要改 textContent，否则会抹掉按钮内的 .login-submit-text / .login-submit-spinner
    els.loginSubmit.disabled = pending;
  }

  if (els.loginForm) {
    $$('input, button', els.loginForm).forEach((el) => {
      if (el !== els.loginSubmit) el.disabled = pending;
    });
  }
}

/**
 * 检查个人资料弹窗是否打开
 * @returns {boolean}
 */
export function isProfileOpen() {
  return !!els.profilePopover && els.profilePopover.classList.contains('is-open');
}

/**
 * 打开个人资料弹窗
 *   - 记录之前焦点元素，关闭时归还（A11y 标准 modal 行为）
 *   - aria-modal 改为 true，提示屏幕阅读器进入对话态
 *   - 焦点移入 popover 内第一个可聚焦元素
 */
export function openProfilePopover() {
  if (!els.profilePopover) return;

  if (profileCloseTimer) {
    clearTimeout(profileCloseTimer);
    profileCloseTimer = null;
  }

  // 记录当前焦点（关闭后归还）
  profilePreviousFocus = (document.activeElement && document.activeElement !== document.body)
    ? document.activeElement
    : els.userAvatarBtn || null;

  els.profilePopover.hidden = false;
  els.profilePopover.setAttribute('aria-modal', 'true');
  requestAnimationFrame(() => {
    els.profilePopover.classList.add('is-open');
    // 焦点移到关闭按钮（最少干扰：用户按 ESC/点击 close 都自然）
    const focusTarget = els.profileClose
      || els.profilePopover.querySelector('input, select, textarea, button:not([disabled])');
    focusTarget?.focus({ preventScroll: true });
  });
  els.userAvatarBtn?.setAttribute('aria-expanded', 'true');

  // 清除反馈消息
  setProfileFeedback('');
  setProfilePwdHint('');
}

/**
 * 关闭个人资料弹窗
 *   - 关闭后焦点归还到打开前的元素
 *   - aria-modal 重置为 false
 */
export function closeProfilePopover() {
  if (!els.profilePopover || !isProfileOpen()) return;

  els.profilePopover.classList.remove('is-open');
  els.profilePopover.setAttribute('aria-modal', 'false');
  els.userAvatarBtn?.setAttribute('aria-expanded', 'false');

  const inner = els.profilePopover.querySelector('.profile-popover-inner');
  const finish = () => {
    if (profileCloseTimer) {
      clearTimeout(profileCloseTimer);
      profileCloseTimer = null;
    }
    if (!isProfileOpen()) els.profilePopover.hidden = true;
    inner?.removeEventListener('transitionend', finish);
  };

  inner?.addEventListener('transitionend', finish);
  profileCloseTimer = setTimeout(finish, 320);

  // 焦点归还
  const target = profilePreviousFocus;
  profilePreviousFocus = null;
  if (target && typeof target.focus === 'function') {
    // 用 rAF 延迟一帧，等过渡和隐藏后归还，避免 hidden=true 导致焦点跳到 body
    requestAnimationFrame(() => {
      try { target.focus({ preventScroll: true }); }
      catch { /* 元素已被卸载则忽略 */ }
    });
  }
}

/**
 * 设置个人资料反馈消息
 *   - success/info 类型 2.4s 后自动消失（与主面板 feedback 行为一致）
 *   - error 类型保留显示，等用户主动操作或下一次设置
 * @param {string} message - 反馈消息
 * @param {string} type - 消息类型 (success, error)
 */
export function setProfileFeedback(message, type = 'success') {
  if (!els.profileFeedback) return;

  if (profileFeedbackTimer) {
    clearTimeout(profileFeedbackTimer);
    profileFeedbackTimer = null;
  }

  els.profileFeedback.textContent = message || '';
  els.profileFeedback.hidden = !message;
  els.profileFeedback.classList.toggle('is-success', !!message && type === 'success');
  els.profileFeedback.classList.toggle('is-error', !!message && type === 'error');

  if (message && type !== 'error') {
    profileFeedbackTimer = window.setTimeout(() => {
      if (!els.profileFeedback) return;
      els.profileFeedback.textContent = '';
      els.profileFeedback.hidden = true;
      els.profileFeedback.classList.remove('is-success', 'is-error');
      profileFeedbackTimer = null;
    }, FEEDBACK_TTL);
  }
}

/**
 * 设置密码修改提示
 * @param {string} message - 提示消息
 * @param {string} tone - 提示色调 (ok, error)
 */
export function setProfilePwdHint(message, tone = '') {
  if (!els.profilePwdHint) return;

  els.profilePwdHint.textContent = message || '';
  els.profilePwdHint.hidden = !message;
  els.profilePwdHint.classList.toggle('is-ok', tone === 'ok');
  els.profilePwdHint.classList.toggle('is-error', tone === 'error');
}
