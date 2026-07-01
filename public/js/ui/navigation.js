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
    // 动画播完后清除内联 delay，避免再次切入时仍受旧值影响
    setTimeout(() => {
      nextPanel.querySelectorAll(':scope > *').forEach((child) => {
        child.style.animationDelay = '';
      });
    }, nextPanel.querySelectorAll(':scope > *').length * 50 + 400);

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
  // workspace-shell 就绪后绑定侧栏导航
  if (authed) initSideNav();
}

/**
 * 应用导航模式
 *   - 'auto':   随窗口宽度自动收紧（≤900px 走紧凑布局，IO 可触发收缩成圆球）
 *   - 'locked': 固定为完整 topbar，禁止收缩（移除滚动哨兵 + 强制展开态）
 * @param {string} mode - 导航模式
 */
export function applyNavMode(mode) {
  if (!els.topnav) return;
  const normalized = (mode === 'locked') ? 'locked' : 'auto';

  // 紧凑模式仅在 auto 下根据视口宽度切换
  const useCompact = normalized === 'auto' && window.matchMedia('(max-width: 900px)').matches;
  els.topnav.classList.toggle('is-compact', useCompact);
  els.topnav.dataset.navMode = normalized;
  document.documentElement.dataset.navMode = normalized;

  // 同步状态（让 syncProfileUI 能取到当前值）
  if (state.profile) state.profile.navMode = normalized;

  // locked 模式下：保证 topbar 处于展开态、解除任何残留收缩样式，并禁用 IO 触发
  const topbar = document.getElementById('topbar');
  if (topbar) {
    if (normalized === 'locked') {
      topbar.classList.remove('is-scrolled-down', 'is-expanded', 'is-settled');
      topbar.style.width = '';
      topbar.style.marginLeft = '';
      topbar.style.marginRight = '';
      topbar.querySelectorAll('.topnav, .topbar-actions, .brand-text, .hamburger-btn')
        .forEach(el => { el.style.cssText = ''; });
      const brand = topbar.querySelector('.topbar-brand');
      const shell = topbar.querySelector('.topbar-shell');
      if (brand) brand.style.cssText = '';
      if (shell) shell.style.cssText = '';
    }
  }
  // 通知 IO 重新评估（隐藏/恢复哨兵）
  document.dispatchEvent(new CustomEvent('navmode:changed', { detail: { mode: normalized } }));

  requestAnimationFrame(() => updateNavIndicator());
}

/**
 * 初始化导航栏悬浮窗的滚动收缩
 *
 * 实现思路：
 *   不再监听 scroll 事件 + 计算 titleThreshold + rAF + 防抖锁，
 *   而是把"过线了吗"交给浏览器：
 *     1. 在 overview 标题位置插入一个 1×1 的 sentinel 哨兵元素
 *     2. 用 IntersectionObserver 观察哨兵进出视口
 *     3. 哨兵滚出视口顶部 → 收缩；进入视口 → 展开
 *
 * 这样 sticky topbar 收缩造成的布局重排不会再触发反向切换 ——
 *   因为 IO 的回调由浏览器在 raster 阶段触发，
 *   且 isIntersecting 状态由实际几何决定，
 *   一次过线只会触发一次回调，根除反馈循环。
 */
export function initScrollHide() {
  const topbar = document.getElementById('topbar');
  const mobileFab = document.getElementById('mobile-fab');
  if (!topbar) return;

  let isCollapsed = false;
  let hasScrolled = false;
  let sentinel = null;
  let observer = null;

  function getThresholdY() {
    // 阈值锚点必须独立于"当前激活的面板"。
    // 旧实现读 #overview-title 的 BCR：overview 未激活时面板 display:none，
    // BCR 退化为 (0,0,0,0)，阈值变成 max(60, scrollY) —— 等于当前滚动位置；
    // 再叠加下方 body 子树 MutationObserver 不断重置哨兵，IO 在 collapse/expand
    // 之间疯狂切换。改用 topbar 自身的自然 offsetTop（sticky 不改写 offsetTop），
    // 与激活的面板无关，跨视图稳定。
    if (!topbar) return 120;
    let y = 0;
    let el = topbar;
    while (el) {
      y += el.offsetTop || 0;
      el = el.offsetParent;
    }
    return Math.max(60, y);
  }

  function ensureSentinel() {
    if (sentinel) return sentinel;
    sentinel = document.createElement('div');
    sentinel.id = 'topbar-scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = [
      'position:absolute',
      'left:0',
      'width:1px',
      'height:1px',
      'pointer-events:none',
      'opacity:0',
    ].join(';');
    document.body.appendChild(sentinel);
    return sentinel;
  }

  function placeSentinel() {
    if (!sentinel) return;
    const next = getThresholdY();
    // 阈值无变化就不写 style.top，避免 MO 高频触发时反复重置哨兵
    // 让 IO 在临界点反复评估
    if (sentinel.dataset.placedAt === String(next)) return;
    sentinel.dataset.placedAt = String(next);
    sentinel.style.top = `${next}px`;
  }

  function doCollapse() {
    if (isCollapsed) return;
    isCollapsed = true;
    topbar.classList.add('is-scrolled-down');
    if (mobileFab) mobileFab.classList.add('is-visible');

    const hiddenElements = topbar.querySelectorAll('.topnav, .topbar-actions, .brand-text, .hamburger-btn');
    hiddenElements.forEach(el => {
      el.style.setProperty('pointer-events', 'none', 'important');
    });

    // 240ms 后补 display:none 彻底隐藏（与 CSS opacity 0.22s 过渡保持一致）
    setTimeout(() => {
      if (!topbar.classList.contains('is-scrolled-down')) return;
      hiddenElements.forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      });
    }, 240);
  }

  function doExpand() {
    if (!isCollapsed) return;
    isCollapsed = false;
    topbar.classList.remove('is-scrolled-down');
    topbar.classList.remove('is-expanded');
    topbar.classList.remove('is-settled');
    topbar.style.width = '';
    topbar.style.marginLeft = '';
    topbar.style.marginRight = '';
    if (mobileFab) mobileFab.classList.remove('is-visible');

    topbar.querySelectorAll('.topnav, .topbar-actions, .brand-text, .hamburger-btn')
      .forEach(el => { el.style.cssText = ''; });
    const brand = topbar.querySelector('.topbar-brand');
    const shell = topbar.querySelector('.topbar-shell');
    if (brand) brand.style.cssText = '';
    if (shell) shell.style.cssText = '';
  }

  function startObserving() {
    ensureSentinel();
    placeSentinel();

    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // 哨兵在视口外（被滚到上方）→ 收缩
      // 哨兵进入视口 → 展开
      if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
        doCollapse();
      } else if (entry.isIntersecting && hasScrolled) {
        doExpand();
      }
    }, { threshold: 0, rootMargin: '0px' });

    observer.observe(sentinel);
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (sentinel && sentinel.parentNode) {
      sentinel.parentNode.removeChild(sentinel);
      sentinel = null;
    }
    // 同时强制展开
    doExpand();
  }

  function applyMode(mode) {
    if (mode === 'locked') {
      stopObserving();
    } else if (!observer) {
      startObserving();
    }
  }

  // 初次启动
  startObserving();
  // 按当前 navMode 决定是否真的启用滚动收缩（locked → stopObserving 强制展开；
  // auto → 保留 observer）。修正 navmode:changed 事件早于本函数注册而被错过、
  // 导致 locked 模式 observer 仍在跑的问题。
  applyMode(els.topnav?.dataset.navMode === 'locked' ? 'locked' : 'auto');

  // 首次滚动后才允许 observer 自动展开
  window.addEventListener('scroll', () => { hasScrolled = true; }, { once: true, passive: true });

  // 加载即展开：topbar 初始保持完整展开态，由 IntersectionObserver 在向下滚动时
  // 动态收缩成小球；不再一加载就先收成小球（避免"没有动态收缩"的观感）。
  // navMode='locked' 时上方 applyMode 已 stopObserving，topbar 始终保持展开。

  // 窗口尺寸变化或字体加载完成后，标题位置可能位移 → 重定位 sentinel
  let placeRaf = 0;
  function schedulePlace() {
    if (placeRaf) return;
    placeRaf = requestAnimationFrame(() => {
      placeRaf = 0;
      placeSentinel();
    });
  }
  window.addEventListener('resize', schedulePlace, { passive: true });
  window.addEventListener('load', schedulePlace);
  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(schedulePlace).catch(() => {});
  }

  // 模板异步挂载或视图切换后，#overview-title 可能新出现 / 偏移
  // 用 MutationObserver 监听 body 子树变化（粗略但成本低，每次只读一次 BCR）
  const mo = new MutationObserver(() => {
    schedulePlace();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // 响应 navMode 切换
  document.addEventListener('navmode:changed', (e) => {
    applyMode(e.detail?.mode);
  });

  // 收缩态下需要隐藏/恢复的子元素选择器
  const HIDDEN_SELECTORS = '.topnav, .topbar-actions, .brand-text, .hamburger-btn';
  // 展开动画时长（略大于 CSS 的 0.4s，作为 transitionend 的兜底）
  const EXPAND_DURATION = 420;
  // 展开操作的代际标记：每次新展开/收起都递增，使挂起的 transitionend/setTimeout 失效
  let expandGeneration = 0;

  /**
   * 强制隐藏 topbar 的子元素（收缩/收起过渡期使用）
   * 立即恢复到圆球态的隐藏效果，杜绝按钮命中区可触发
   * @param {HTMLElement} topbarEl - topbar 元素
   */
  function forceHideChildren(topbarEl) {
    topbarEl.querySelectorAll(HIDDEN_SELECTORS).forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
    const shell = topbarEl.querySelector('.topbar-shell');
    if (shell) shell.style.setProperty('pointer-events', 'none', 'important');
  }

  /**
   * 清除子元素的内联隐藏样式（仅在展开动画结束后调用）
   * @param {HTMLElement} topbarEl - topbar 元素
   */
  function clearInlineStyles(topbarEl) {
    topbarEl.querySelectorAll(HIDDEN_SELECTORS).forEach(el => { el.style.cssText = ''; });
    const brand = topbarEl.querySelector('.topbar-brand');
    const shell = topbarEl.querySelector('.topbar-shell');
    if (brand) brand.style.cssText = '';
    if (shell) shell.style.cssText = '';
  }

  /**
   * 收起 topbar（移除展开态、重建隐藏、收缩宽度）
   * @param {HTMLElement} topbarEl - topbar 元素
   */
  function collapseTopbar(topbarEl) {
    // 0. 使本次收起取代任何挂起的展开回调（代际标记递增）
    expandGeneration++;

    // 1. 立即重建隐藏态（阻断按钮命中区，防止收缩动画中误触）
    forceHideChildren(topbarEl);

    // 2. 移除展开态与就绪标记
    topbarEl.classList.remove('is-expanded');
    topbarEl.classList.remove('is-settled');

    // 3. 宽度动画收缩到 56px
    const maxWidth = Math.min(1200, window.innerWidth - 32);
    topbarEl.style.width = `${maxWidth}px`;
    requestAnimationFrame(() => {
      topbarEl.style.width = '56px';
      topbarEl.style.marginLeft = '18px';
    });
  }

  topbar.addEventListener('click', (e) => {
    const isInCollapsedState = topbar.classList.contains('is-scrolled-down');
    if (!isInCollapsedState) return;

    e.preventDefault();
    e.stopPropagation();

    const isExpanded = topbar.classList.contains('is-expanded');

    if (!isExpanded) {
      // === 展开 ===
      // 1. 清除残留的内联 display/visibility（来自收缩态的 setTimeout 隐藏），
      //    让 CSS 的 .is-expanded 规则能接管显示。
      //    注意：不清 pointer-events——由 CSS 的 :not(.is-settled) 门控在动画中禁用点击，
      //    动画结束后由 clearInlineStyles 统一清除。
      topbar.querySelectorAll(HIDDEN_SELECTORS).forEach(el => {
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
      });
      const shell = topbar.querySelector('.topbar-shell');
      if (shell) shell.style.removeProperty('pointer-events');

      // 2. 添加 is-expanded 类，让 CSS 接管布局（宽度动画由下方内联 style 触发）
      topbar.classList.add('is-expanded');

      // 2. 触发宽度动画（CSS transition 自动处理）
      topbar.style.width = '56px';
      requestAnimationFrame(() => {
        const expandWidth = Math.min(1200, window.innerWidth - 32);
        topbar.style.width = `${expandWidth}px`;
        topbar.style.marginLeft = '18px';
        topbar.style.marginRight = 'auto';
      });

      // 3. 等待展开动画结束：用 transitionend 监听 width，setTimeout 兜底
      //    用本次展开专用的 expandGen 标记，防止后续收起/再展开的 transitionend 误触发本次回调
      const expandGen = ++expandGeneration;

      const onExpandEnd = () => {
        // 动画被中途打断（如已收起、或已开始新一轮展开）则不恢复交互
        if (expandGen !== expandGeneration) return;
        if (!topbar.classList.contains('is-expanded')) return;
        clearInlineStyles(topbar);
        topbar.classList.add('is-settled');
      };

      let settled = false;
      const finalize = () => {
        if (settled) return;
        if (expandGen !== expandGeneration) return;  // 已被新一轮操作取代
        settled = true;
        topbar.removeEventListener('transitionend', onTransition);
        onExpandEnd();
      };
      const onTransition = (ev) => {
        if (ev.target === topbar && ev.propertyName === 'width') finalize();
      };
      topbar.addEventListener('transitionend', onTransition);
      setTimeout(finalize, EXPAND_DURATION);
    } else {
      // === 收起 ===
      collapseTopbar(topbar);
    }
  });

  // 点击外部收起展开的导航栏
  document.addEventListener('click', (e) => {
    if (!topbar.classList.contains('is-expanded')) return;
    if (topbar.contains(e.target)) return;
    collapseTopbar(topbar);
  });

  // 移动端 FAB 点击事件
  if (mobileFab) {
    mobileFab.addEventListener('click', () => {
      const hamburgerBtn = document.getElementById('hamburger-btn');
      if (hamburgerBtn) hamburgerBtn.click();
    });
  }

  // ── 回到顶部悬浮按钮 ──
  const backToTopFab = document.getElementById('back-to-top-fab');
  if (backToTopFab) {
    let scrollRaf = 0;
    window.addEventListener('scroll', () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (window.scrollY > 300) {
          backToTopFab.hidden = false;
          backToTopFab.classList.add('is-visible');
        } else {
          backToTopFab.classList.remove('is-visible');
        }
      });
    }, { passive: true });
    backToTopFab.addEventListener('click', () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

}

// ── 侧栏导航：折叠/展开（独立初始化，workspace-shell 就绪后调用）──
let sideNavBound = false;
export function initSideNav() {
  if (sideNavBound) return;
  sideNavBound = true;

  // 恢复折叠状态，并同步 --side-nav-w 让 topbar 贴齐内容区
  const sn = document.getElementById('side-nav');
  if (sn && localStorage.getItem('side-nav-collapsed') === '1') {
    sn.classList.add('is-collapsed');
  }
  document.documentElement.style.setProperty(
    '--side-nav-w',
    sn?.classList.contains('is-collapsed') ? '52px' : '172px',
  );

  // 事件委托：仅 toggle 点击折叠/展开（点 nav-chip 只切视图，不再自动收缩）
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('#side-nav-toggle');
    if (toggle) {
      e.preventDefault();
      const sn = document.getElementById('side-nav');
      if (!sn) return;
      const collapsed = sn.classList.toggle('is-collapsed');
      localStorage.setItem('side-nav-collapsed', collapsed ? '1' : '0');
      document.documentElement.style.setProperty('--side-nav-w', collapsed ? '52px' : '172px');
      requestAnimationFrame(() => updateNavIndicator());
      return;
    }
  });
}