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
  const left = btnRect.left - navRect.left + nav.scrollLeft;
  indicator.style.opacity = '1';
  indicator.style.width = `${btnRect.width}px`;
  indicator.style.transform = `translateX(${left}px)`;
}

// 动画队列，防止快速切换导致冲突
let animationQueue = Promise.resolve();

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
  // 如果已经是当前视图，不做任何操作
  if (state.activeView === view) return;

  // 将切换操作加入队列，防止快速点击导致动画冲突
  animationQueue = animationQueue.then(() => performViewTransition(view));
}

/**
 * 执行视图切换动画
 * @param {string} view - 目标视图
 */
async function performViewTransition(view) {
  const previousView = state.activeView;
  const previousPanel = document.querySelector(`.workspace-panel[data-panel="${previousView}"]`);
  const nextPanel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);

  // 如果目标面板不存在，直接返回
  if (!nextPanel) {
    console.warn(`视图 "${view}" 不存在`);
    return;
  }

  // 如果是同一个面板，不需要动画
  if (previousPanel === nextPanel) {
    state.activeView = view;
    updateNavigationUI(view);
    return;
  }

  try {
    // 1. 旧面板退出动画
    if (previousPanel) {
      previousPanel.classList.add('page-exit');
      await wait(200); // 等待退出动画完成
      previousPanel.classList.remove('active', 'page-exit');
    }

    // 2. 更新状态
    state.activeView = view;
    updateNavigationUI(view);

    // 3. 新面板进入动画
    if (nextPanel) {
      // 添加 active 类但保持不可见
      nextPanel.classList.add('active');

      // 强制重排，确保动画生效
      void nextPanel.offsetHeight;

      // 添加进入动画类
      nextPanel.classList.add('page-enter');

      // 等待一帧后移除动画类，让 CSS 接管
      await wait(50);
      nextPanel.classList.remove('page-enter');

      // 重置子元素动画（重新触发 stagger）
      nextPanel.querySelectorAll(':scope > *').forEach((child, index) => {
        child.style.animation = 'none';
        void child.offsetHeight;
        child.style.animation = '';
        // 为子元素设置延迟，创建交错效果
        child.style.animationDelay = `${index * 50}ms`;
      });
    }

    // 4. 关闭个人资料弹窗（除非在设置页面）
    if (view !== 'settings') {
      closeProfilePopover();
    }

    // 5. 清除反馈消息
    clearFeedback(view);

    // 6. 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error('视图切换动画失败:', error);
    // 降级处理：直接切换
    if (previousPanel) previousPanel.classList.remove('active');
    if (nextPanel) nextPanel.classList.add('active');
    state.activeView = view;
    updateNavigationUI(view);
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

