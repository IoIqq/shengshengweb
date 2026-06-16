/**
 * 导航和视图切换模块
 * 负责处理视图切换、导航指示器更新和快捷键触发
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { $$ } from '../utils/helpers.js';
import { closeProfilePopover, clearFeedback } from './feedback.js';

/**
 * 更新导航指示器位置
 * 根据当前激活的导航按钮位置更新滑动指示器
 */
export function updateNavIndicator() {
  const indicator = els.navIndicator;
  const nav = els.topnav;
  if (!indicator || !nav) return;

  const active = nav.querySelector('.nav-chip.is-active');
  if (!active) {
    indicator.style.opacity = '0';
    return;
  }

  const navRect = nav.getBoundingClientRect();
  const btnRect = active.getBoundingClientRect();
  const indicatorWidth = 14;
  const left = btnRect.left - navRect.left + nav.scrollLeft + (btnRect.width - indicatorWidth) / 2;
  indicator.style.opacity = '1';
  indicator.style.width = `${indicatorWidth}px`;
  indicator.style.transform = `translateX(${left}px)`;
}

let transitionToken = 0;

/**
 * 等待指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 设置当前激活的视图（带平滑动画）
 * @param {string} view - 视图名称 (overview, media, review, todo, device, borrow, team, settings)
 */
export function setActiveView(view) {
  const nextPanel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
  if (!view || !nextPanel) {
    console.warn(`视图 "${view}" 不存在`);
    return;
  }

  const token = ++transitionToken;
  if (state.activeView === view) {
    normalizePanels(view);
    updateNavigationUI(view);
    return;
  }

  state.activeView = view;
  updateNavigationUI(view);
  performViewTransition(view, token);
}

function normalizePanels(activeView) {
  $$('.workspace-panel').forEach((panel) => {
    const active = panel.dataset.panel === activeView;
    panel.classList.toggle('active', active);
    panel.classList.remove('page-enter', 'page-exit');
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

/**
 * 执行视图切换动画
 * @param {string} view - 目标视图
 */
async function performViewTransition(view, token) {
  const previousPanel = document.querySelector('.workspace-panel.active');
  const nextPanel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);

  if (!nextPanel) return;
  if (previousPanel === nextPanel) {
    normalizePanels(view);
    return;
  }

  try {
    if (previousPanel) {
      previousPanel.classList.add('page-exit');
      await wait(200);
      if (token !== transitionToken) return;
    }

    normalizePanels(view);

    nextPanel.classList.add('page-enter');
    void nextPanel.offsetHeight;
    await wait(50);
    if (token !== transitionToken) return;
    nextPanel.classList.remove('page-enter');

    nextPanel.querySelectorAll(':scope > *').forEach((child, index) => {
      child.style.animation = 'none';
      void child.offsetHeight;
      child.style.animation = '';
      child.style.animationDelay = `${index * 50}ms`;
    });

    if (view !== 'settings') {
      closeProfilePopover();
    }

    clearFeedback(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('视图切换动画失败:', error);
    if (token === transitionToken) {
      normalizePanels(view);
      updateNavigationUI(view);
    }
  }
}

/**
 * 更新导航 UI 状态
 * @param {string} view - 当前视图
 */
function updateNavigationUI(view) {
  // 更新导航按钮状态
  $$('.nav-chip').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  // 更新滑动指示器
  requestAnimationFrame(() => updateNavIndicator());
}

/**
 * 触发快捷键操作
 * @param {string} action - 操作名称 (jump-*, upload, sync, backup)
 */
export function triggerShortcut(action) {
  if (!action) return;

  // 跳转到指定视图
  if (action.startsWith('jump-')) {
    setActiveView(action.replace('jump-', ''));
    return;
  }

  // 上传素材
  if (action === 'upload') {
    setActiveView('media');
    els.uploadBtn?.click();
    return;
  }

  // 同步素材
  if (action === 'sync') {
    setActiveView('media');
    els.syncBtn?.click();
    return;
  }

  // 备份数据
  if (action === 'backup') {
    window.open('/api/backup', '_blank', 'noopener');
    return;
  }
}

/**
 * 设置登录状态的 Shell 显示
 * @param {boolean} authed - 是否已认证
 */
export function setShellLoggedIn(authed) {
  if (els.authShell) els.authShell.classList.toggle('hidden', authed);
  if (els.workspaceShell) els.workspaceShell.classList.toggle('hidden', !authed);
  if (els.workspaceShell) els.workspaceShell.classList.toggle('is-ready', authed);
}

/**
 * 应用导航模式（自动/紧凑）
 * @param {string} mode - 导航模式 (auto, compact)
 */
export function applyNavMode(mode) {
  if (!els.topnav) return;
  const useCompact = mode === 'auto' && window.matchMedia('(max-width: 900px)').matches;
  els.topnav.classList.toggle('is-compact', useCompact);
  els.topnav.dataset.navMode = mode;
  requestAnimationFrame(() => updateNavIndicator());
}

/**
 * 初始化导航栏悬浮窗滚动隐藏
 * 向下滚动超过阈值时收成右上角圆球，向上滚动时还原；点圆球可持久展开
 */
export function initScrollHide() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const HIDE_THRESHOLD = 60;
  const SHOW_AT_TOP = 30;
  let lastScrollY = window.scrollY;
  let ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;

        if (currentY <= SHOW_AT_TOP) {
          topbar.classList.remove('is-scrolled-down');
          topbar.classList.remove('is-expanded');
        } else if (delta > HIDE_THRESHOLD) {
          topbar.classList.add('is-scrolled-down');
          topbar.classList.remove('is-expanded');
        } else if (delta < -8) {
          topbar.classList.remove('is-scrolled-down');
          topbar.classList.remove('is-expanded');
        }

        lastScrollY = currentY;
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  topbar.addEventListener('click', (e) => {
    if (!topbar.classList.contains('is-scrolled-down')) return;
    if (e.target.closest('.nav-chip, .topbar-actions, .hamburger-btn, .avatar-btn')) return;
    topbar.classList.toggle('is-expanded');
  });

  document.addEventListener('click', (e) => {
    if (!topbar.classList.contains('is-expanded')) return;
    if (topbar.contains(e.target)) return;
    topbar.classList.remove('is-expanded');
  });
}

