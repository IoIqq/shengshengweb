(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 768;

  function init() {
    const btn = document.getElementById("hamburger-btn");
    const drawer = document.getElementById("mobile-nav-drawer");
    const overlay = document.getElementById("mobile-nav-overlay");
    const closeBtn = document.getElementById("mobile-nav-close");
    const itemsBox = drawer && drawer.querySelector(".mobile-nav-items");
    const topnav = document.getElementById("topnav");

    if (!btn || !drawer || !itemsBox || !topnav) return;

    function syncItems() {
      itemsBox.innerHTML = "";
      topnav.querySelectorAll(".nav-chip").forEach((chip) => {
        const clone = chip.cloneNode(true);
        clone.removeAttribute("id");
        clone.classList.remove("is-active");
        clone.addEventListener("click", () => {
          chip.click();
          close();
        });
        itemsBox.appendChild(clone);
      });
    }

    function focusableInDrawer() {
      return drawer.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
    }

    function trapTab(e) {
      if (e.key !== "Tab") return;
      const items = focusableInDrawer();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function open() {
      syncItems();
      drawer.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      // 焦点交给抽屉的关闭按钮
      requestAnimationFrame(() => closeBtn && closeBtn.focus());
      drawer.addEventListener("keydown", trapTab);
    }

    function close() {
      drawer.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      drawer.removeEventListener("keydown", trapTab);
      // 焦点回到汉堡按钮
      btn.focus();
    }

    btn.addEventListener("click", () => {
      if (drawer.hidden) open();
      else close();
    });
    overlay && overlay.addEventListener("click", close);
    closeBtn && closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !drawer.hidden) close();
    });

    function updateVisibility() {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
      btn.hidden = !isMobile;
      if (!isMobile && !drawer.hidden) close();
    }

    updateVisibility();
    window.addEventListener("resize", updateVisibility);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
