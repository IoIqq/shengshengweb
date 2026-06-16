let initialized = false;

const MOBILE_BREAKPOINT = 768;

export function initMobileNav() {
  if (initialized) return;

  const btn = document.getElementById('hamburger-btn');
  const drawer = document.getElementById('mobile-nav-drawer');
  const overlay = document.getElementById('mobile-nav-overlay');
  const closeBtn = document.getElementById('mobile-nav-close');
  const itemsBox = drawer?.querySelector('.mobile-nav-items');
  const topnav = document.getElementById('topnav');

  if (!btn || !drawer || !itemsBox || !topnav) return;

  initialized = true;

  function syncItems() {
    itemsBox.innerHTML = '';
    topnav.querySelectorAll('.nav-chip').forEach((chip) => {
      const clone = chip.cloneNode(true);
      clone.removeAttribute('id');
      clone.classList.remove('is-active');
      clone.addEventListener('click', () => {
        chip.click();
        close();
      });
      itemsBox.appendChild(clone);
    });
  }

  function focusableInDrawer() {
    return drawer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');
  }

  function trapTab(event) {
    if (event.key !== 'Tab') return;
    const items = focusableInDrawer();
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open() {
    syncItems();
    drawer.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => closeBtn?.focus());
    drawer.addEventListener('keydown', trapTab);
  }

  function close() {
    drawer.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    drawer.removeEventListener('keydown', trapTab);
    btn.focus();
  }

  btn.addEventListener('click', () => {
    if (drawer.hidden) open();
    else close();
  });
  overlay?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) close();
  });

  function updateVisibility() {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    btn.hidden = !isMobile;
    if (!isMobile && !drawer.hidden) close();
  }

  updateVisibility();
  window.addEventListener('resize', updateVisibility);

  // ========== 底部 Tab 导航栏逻辑 ==========
  initTabBar(topnav, drawer);
}

function initTabBar(topnav, drawer) {
  const tabBar = document.getElementById('mobile-tab-bar');
  const tabButtons = tabBar?.querySelectorAll('.tab-item[data-view]');
  const moreBtn = document.getElementById('tab-more-btn');

  if (!tabBar || !tabButtons || !tabButtons.length) return;

  // 点击普通 Tab 按钮 → 触发对应的 topnav chip
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      const targetChip = topnav.querySelector(`.nav-chip[data-view="${view}"]`);
      if (targetChip) {
        targetChip.click();
        syncTabActiveState(view);
      }
    });
  });

  // 点击"更多"按钮 → 打开抽屉
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      const hamburgerBtn = document.getElementById('hamburger-btn');
      if (hamburgerBtn && !drawer.hidden) {
        // 抽屉已打开，不做任何事
        return;
      }
      hamburgerBtn?.click();
      // 临时将"更多"设为激活态
      moreBtn.classList.add('is-active');
      tabButtons.forEach((btn) => {
        if (btn !== moreBtn) btn.classList.remove('is-active');
      });
    });
  }

  // 监听视图切换 → 同步 Tab 选中状态
  // 通过 MutationObserver 观察 topnav 中 .is-active 的变化
  const navChips = topnav.querySelectorAll('.nav-chip');
  const observer = new MutationObserver(() => {
    navChips.forEach((chip) => {
      if (chip.classList.contains('is-active')) {
        syncTabActiveState(chip.dataset.view);
      }
    });
  });

  navChips.forEach((chip) => {
    observer.observe(chip, { attributes: true, attributeFilter: ['class'] });
  });

  // 初始化时同步一次状态
  const activeChip = topnav.querySelector('.nav-chip.is-active');
  if (activeChip) {
    syncTabActiveState(activeChip.dataset.view);
  }
}

function syncTabActiveState(activeView) {
  const tabBar = document.getElementById('mobile-tab-bar');
  if (!tabBar) return;

  const tabButtons = tabBar.querySelectorAll('.tab-item[data-view]');
  tabButtons.forEach((btn) => {
    if (btn.dataset.view === activeView) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
}
