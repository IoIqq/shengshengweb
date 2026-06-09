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
}
