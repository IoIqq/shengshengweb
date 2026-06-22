/**
 * 偏好设置模块
 *
 * 持久化策略：
 *   - theme / confirmDanger 走本地 localStorage（key: shengsheng.workspace.preferences）
 *   - navMode 复用现有 PATCH /api/profile 链路（与右上角头像弹窗共享 state）
 *
 * theme 反闪烁：public/index.html 的 <head> 内联脚本会在 CSS 解析前先写一次 data-theme，
 * 这里负责后续的 select 绑定 / 自动模式下 prefers-color-scheme 实时跟随 / 维护标签 confirm 行为。
 */

import { state } from '../core/state.js';
import { applyNavMode } from '../ui/navigation.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

const STORAGE_KEY = 'shengsheng.workspace.preferences';

const DEFAULTS = Object.freeze({
  theme: 'auto',          // 'auto' | 'light' | 'dark'
  confirmDanger: true,    // 危险操作前是否弹 confirm
});

let mediaWatcher = null;

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeRaw(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) { /* 隐私模式忽略 */ }
}

export function loadPreferences() {
  const stored = readRaw() || {};
  return {
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : DEFAULTS.theme,
    confirmDanger: typeof stored.confirmDanger === 'boolean' ? stored.confirmDanger : DEFAULTS.confirmDanger,
    navMode: state.session?.user?.navMode || state.profile?.navMode || 'auto',
  };
}

function persist(partial) {
  const next = { ...loadPreferences(), ...partial };
  writeRaw({ theme: next.theme, confirmDanger: next.confirmDanger });
  return next;
}

function resolveTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);

  if (mediaWatcher) {
    mediaWatcher.removeEventListener('change', mediaWatcher._handler);
    mediaWatcher = null;
  }
  if (theme === 'auto') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    mq._handler = handler;
    mediaWatcher = mq;
  }
}

/**
 * 危险操作的二次确认门控。
 * 偏好开则弹原生 confirm；偏好关则直接放行。
 * @param {string} message
 * @returns {boolean}
 */
export function confirmIfNeeded(message) {
  const { confirmDanger } = loadPreferences();
  if (!confirmDanger) return true;
  return window.confirm(message);
}

export function initPreferencesPanel() {
  const themeSelect = document.getElementById('preference-theme');
  const navModeSelect = document.getElementById('preference-nav-mode');
  const confirmToggle = document.getElementById('preference-confirm-danger');

  const prefs = loadPreferences();

  if (themeSelect) {
    themeSelect.value = prefs.theme;
    themeSelect.onchange = () => {
      const next = persist({ theme: themeSelect.value });
      applyTheme(next.theme);
      Toast.success('外观偏好已保存（本地）');
    };
  }

  if (navModeSelect) {
    navModeSelect.value = prefs.navMode;
    navModeSelect.onchange = async () => {
      const mode = navModeSelect.value === 'locked' ? 'locked' : 'auto';
      applyNavMode(mode);
      try {
        await requestJSON('/api/profile', { method: 'PATCH', body: { navMode: mode } });
        if (state.session?.user) state.session.user.navMode = mode;
        if (state.profile) state.profile.navMode = mode;
        // 同步右上角头像弹窗里的同名 select（如果已挂载）
        const popoverSelect = document.getElementById('profile-nav-mode');
        if (popoverSelect && popoverSelect !== navModeSelect) popoverSelect.value = mode;
        Toast.success(`导航模式：${mode === 'locked' ? '锁定' : '自动'}`);
      } catch (error) {
        Toast.warning('导航模式已切换，但未能同步到服务器');
      }
    };
  }

  if (confirmToggle) {
    confirmToggle.checked = Boolean(prefs.confirmDanger);
    confirmToggle.onchange = () => {
      persist({ confirmDanger: Boolean(confirmToggle.checked) });
      Toast.success(`危险操作${confirmToggle.checked ? '需' : '免'}二次确认`);
    };
  }
}
