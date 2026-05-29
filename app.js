(function () {
  "use strict";

  // Toast 通知系统
  const Toast = {
    container: null,
    queue: [],
    maxVisible: 3,
    defaultDuration: 4000,

    init() {
      this.container = document.getElementById("toast-container");
      if (!this.container) {
        this.container = document.createElement("div");
        this.container.id = "toast-container";
        this.container.className = "toast-container";
        this.container.setAttribute("aria-live", "polite");
        this.container.setAttribute("aria-atomic", "true");
        document.body.appendChild(this.container);
      }
    },

    show(options) {
      if (!this.container) this.init();

      const {
        title = "",
        message = "",
        tone = "info",
        duration = this.defaultDuration,
        closeable = true,
      } = typeof options === "string" ? { message: options } : options;

      const toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("data-tone", tone);
      toast.setAttribute("role", "alert");

      const iconMap = {
        success: "✓",
        error: "✕",
        warning: "⚠",
        info: "ℹ",
      };

      toast.innerHTML = `
        <div class="toast-icon">${iconMap[tone] || iconMap.info}</div>
        <div class="toast-content">
          ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ""}
          <div class="toast-message">${this.escapeHtml(message)}</div>
        </div>
        ${closeable ? '<button class="toast-close" type="button" aria-label="关闭">✕</button>' : ""}
      `;

      if (closeable) {
        const closeBtn = toast.querySelector(".toast-close");
        closeBtn?.addEventListener("click", () => this.remove(toast));
      }

      this.container.appendChild(toast);
      this.queue.push(toast);

      // 限制同时显示的数量
      if (this.queue.length > this.maxVisible) {
        const oldest = this.queue.shift();
        if (oldest) this.remove(oldest);
      }

      // 触发动画
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          toast.classList.add("is-visible");
        });
      });

      // 自动关闭
      if (duration > 0) {
        setTimeout(() => this.remove(toast), duration);
      }

      return toast;
    },

    remove(toast) {
      if (!toast || !toast.isConnected) return;

      toast.classList.remove("is-visible");
      setTimeout(() => {
        if (toast.isConnected) {
          toast.remove();
          const index = this.queue.indexOf(toast);
          if (index > -1) this.queue.splice(index, 1);
        }
      }, 300);
    },

    success(message, title = "") {
      return this.show({ message, title, tone: "success" });
    },

    error(message, title = "") {
      return this.show({ message, title, tone: "error", duration: 6000 });
    },

    warning(message, title = "") {
      return this.show({ message, title, tone: "warning" });
    },

    info(message, title = "") {
      return this.show({ message, title, tone: "info" });
    },

    escapeHtml(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    },
  };

  // 初始化 Toast
  Toast.init();
  window.showToast = (message, tone = "info") => {
    Toast.show({ message, tone });
  };

  const cfg = window.shengshengConfig || {};

  // ═══════════════════════════════════════════════════════════════════════════════
  // 📦 模块 1：基础设施 - 全局状态 / 排序器 / DOM 引用 / 模板 / 视图标签 / 常量
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：管理应用全局状态，缓存 DOM 节点引用，定义全局常量
  // 调用方：所有模块
  // 详见：CODE_GUIDE.md → "模块 1：基础设施"
  // ═══════════════════════════════════════════════════════════════════════════════
  const state = {
    session: null,
    bootstrap: null,
    activeView: "overview",
    loginPending: false,
    actionPending: false,
    mediaFilter: "all",
    mediaSearch: "",
    mediaSort: "newest",
    reviewFilter: "all",
    reviewSort: "newest",
    selectedMedia: new Set(),
    deviceFilter: "all",
    deviceSearch: "",
    borrowFilter: "all",
    borrowSearch: "",
    deviceCatalog: [],
    borrowCatalog: [],
    deviceItems: [],
    borrowItems: [],
    teamCatalog: [],
    teamItems: [],
    teamFilter: "all",
    teamSearch: "",
    teamSort: "name",
    teamEditingId: null,
    deviceEditingId: null,
    profile: {
      displayName: "",
      signature: "",
      navMode: "auto",
    },
  };
  const SORTERS = cfg.SORTERS || {
    newest: (arr) => [...arr].sort((a, b) => (b.uploadedAt || b.createdAt || "").localeCompare(a.uploadedAt || a.createdAt || "")),
    oldest: (arr) => [...arr].sort((a, b) => (a.uploadedAt || a.createdAt || "").localeCompare(b.uploadedAt || b.createdAt || "")),
    title: (arr) => [...arr].sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    author: (arr) => [...arr].sort((a, b) => (a.author || "").localeCompare(b.author || "")),
    priority: (arr) => {
      const order = { high: 0, medium: 1, low: 2 };
      return [...arr].sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
    },
  };

  function sortMedia(items, sortBy) { return (SORTERS[sortBy] || SORTERS.newest)(items); }
  function sortReview(items, sortBy) { return (SORTERS[sortBy] || SORTERS.newest)(items); }
  function reviewMatchesFilter(item) {
    const filter = state.reviewFilter;
    if (filter === "all") return item.reviewState === "pending";
    return item.kind === filter;
  }

  function toggleMediaSelection(id) {
    if (state.selectedMedia.has(id)) {
      state.selectedMedia.delete(id);
    } else {
      state.selectedMedia.add(id);
    }
  }

  function clearMediaSelection() {
    state.selectedMedia.clear();
  }

  function selectAllVisibleMedia() {
    const items = (state.bootstrap?.media || [])
      .filter((item) => mediaMatchesFilter(item) && matchesSearch(item, state.mediaSearch));
    items.forEach((item) => state.selectedMedia.add(item.id));
    renderMedia();
  }

  const els = {
    authShell: document.getElementById("auth-shell"),
    workspaceShell: document.getElementById("workspace-shell"),
    loginForm: document.getElementById("login-form"),
    loginMessage: document.getElementById("login-message"),
    loginSubmit: document.querySelector("#login-form button[type='submit']"),
    logoutBtn: document.getElementById("logout-btn"),
    refreshBtn: document.getElementById("refresh-btn"),
    topnav: document.getElementById("topnav"),
    navIndicator: document.getElementById("nav-indicator"),
    siteTitle: document.getElementById("site-title"),
    homeHeroMessage: document.getElementById("home-hero-message"),
    rolePill: document.getElementById("role-pill"),
    roleTitle: document.getElementById("role-title"),
    roleDescription: document.getElementById("role-description"),
    dashboardStats: document.getElementById("dashboard-stats"),
    overviewGrid: document.getElementById("overview-grid"),
    activityList: document.getElementById("activity-list"),
    mediaGrid: document.getElementById("media-grid"),
    mediaSearch: document.getElementById("media-search"),
    mediaSort: document.getElementById("media-sort"),
    mediaFilters: document.getElementById("media-filters"),
    reviewStack: document.getElementById("review-stack"),
    reviewCount: document.getElementById("review-count"),
    todoForm: document.getElementById("todo-form"),
    todoList: document.getElementById("todo-list"),
    todoOpenCount: document.getElementById("todo-open-count"),
    todoAssigneeSelect: document.getElementById("todo-assignee-select"),
    deviceForm: document.getElementById("device-form"),
    deviceFormId: document.getElementById("device-form-id"),
    deviceFormSubmit: document.getElementById("device-form-submit"),
    deviceFormCancel: document.getElementById("device-form-cancel"),
    deviceList: document.getElementById("device-list"),
    deviceCount: document.getElementById("device-count"),
    deviceRefreshBtn: document.getElementById("device-refresh-btn"),
    deviceFilters: document.getElementById("device-filters"),
    deviceSearch: document.getElementById("device-search"),
    borrowForm: document.getElementById("borrow-form"),
    borrowList: document.getElementById("borrow-list"),
    borrowCount: document.getElementById("borrow-count"),
    borrowRefreshBtn: document.getElementById("borrow-refresh-btn"),
    borrowFilters: document.getElementById("borrow-filters"),
    borrowSearch: document.getElementById("borrow-search"),
    borrowDeviceSelect: document.getElementById("borrow-device-select"),
    teamGrid: document.getElementById("team-grid"),
    teamCount: document.getElementById("team-count"),
    teamRefreshBtn: document.getElementById("team-refresh-btn"),
    teamAddBtn: document.getElementById("team-add-btn"),
    teamStats: document.getElementById("team-stats"),
    teamForm: document.getElementById("team-form"),
    teamFormId: document.getElementById("team-form-id"),
    teamFormSubmit: document.getElementById("team-form-submit"),
    teamFormCancel: document.getElementById("team-form-cancel"),
    teamSearch: document.getElementById("team-search"),
    teamSort: document.getElementById("team-sort"),
    teamFilters: document.getElementById("team-filters"),
    settingsNav: document.getElementById("settings-nav"),
    settingsPanel: document.getElementById("settings-panel"),
    settingsForm: document.getElementById("settings-form"),
    systemCard: document.getElementById("system-card"),
    settingsSubmitBtn: document.querySelector("#settings-form button[type='submit']"),
    uploadBtn: document.getElementById("upload-btn"),
    syncBtn: document.getElementById("sync-btn"),
    userAvatarBtn: document.getElementById("user-avatar-btn"),
    userAvatarInitials: document.getElementById("user-avatar-initials"),
    avatarTooltip: document.getElementById("avatar-tooltip"),
    profilePopover: document.getElementById("profile-popover"),
    profileClose: document.getElementById("profile-close"),
    profileForm: document.getElementById("profile-form"),
    profileDisplayName: document.getElementById("profile-display-name"),
    profileSignature: document.getElementById("profile-signature"),
    profileNavMode: document.getElementById("profile-nav-mode"),
    profileAccountName: document.getElementById("profile-account-name"),
    profileAccountRole: document.getElementById("profile-account-role"),
    profileAvatarPreview: document.getElementById("profile-avatar-preview"),
    profilePreviewName: document.getElementById("profile-preview-name"),
    profilePreviewSignature: document.getElementById("profile-preview-signature"),
  };

  const VIEW_LABELS = cfg.VIEW_LABELS || {
    overview: "首页",
    media: "素材库",
    review: "审片中心",
    todo: "待办事项",
    device: "设备登记",
    borrow: "借出申请",
    team: "团队协作",
    settings: "系统设置",
  };

  const LOGIN_PLACEHOLDER = cfg.UI?.LOGIN_PLACEHOLDER || "请输入管理员账号和密码";
  const FEEDBACK_TTL = cfg.UI?.FEEDBACK_TTL ?? 2400;
  const CLIENT_LOG_ENDPOINT = cfg.API?.CLIENT_LOG || "/api/client-log";
  const PROFILE_STORAGE_KEY = cfg.UI?.PROFILE_STORAGE_KEY || "shengsheng.workspace.profile";
  const DEBOUNCE_DELAY = cfg.UI?.DEBOUNCE_DELAY ?? 300;

  let feedbackTimer = null;
  let revealObserver = null;
  let searchDebounceTimers = {};

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🔧 模块 2：工具函数（DOM 选择 / 格式化 / 防抖 / 转义）
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：通用工具方法，无业务逻辑
  // 详见：CODE_GUIDE.md → "模块 2：工具函数"
  // ═══════════════════════════════════════════════════════════════════════════════
  function $(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function $$ (selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function nowText() {
    return new Date().toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getRoleLabel(role) {
    if (role === "admin") return "管理员";
    if (role === "member") return "成员";
    return "访客";
  }

  function getInitials(name) {
    const text = String(name || "").trim();
    if (!text) return "工";
    return text.slice(0, 1).toUpperCase();
  }

  function formatDatetime(value) {
    if (!value) return "-";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function debounce(fn, delay, key = "default") {
    return function (...args) {
      clearTimeout(searchDebounceTimers[key]);
      searchDebounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeListResponse(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 📡 模块 4：数据同步（查询构建 / 视图过滤 / 异步刷新）
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：将 catalog 全量数据按筛选条件转换为视图数据
  // 依赖：state.deviceCatalog, state.borrowCatalog
  // 调用方：renderDevices(), renderBorrowRequests(), refreshAll()
  // ═══════════════════════════════════════════════════════════════════════════════
  function buildDeviceQuery() {
    const params = new URLSearchParams();
    const search = String(state.deviceSearch || "").trim();
    if (search) params.set("search", search);
    if (state.deviceFilter && state.deviceFilter !== "all") params.set("status", state.deviceFilter);
    return params.toString();
  }

  function buildBorrowQuery() {
    const params = new URLSearchParams();
    const search = String(state.borrowSearch || "").trim();
    if (search) params.set("search", search);
    if (state.borrowFilter && state.borrowFilter !== "all") params.set("status", state.borrowFilter);
    return params.toString();
  }

  function getDeviceSourceItems() {
    return Array.isArray(state.deviceCatalog) ? state.deviceCatalog : [];
  }

  function getBorrowSourceItems() {
    return Array.isArray(state.borrowCatalog) ? state.borrowCatalog : [];
  }

  function getAvailableBorrowDevices() {
    return getDeviceSourceItems().filter((item) => item.status !== "maintenance");
  }

  function deviceMatchesView(item) {
    const search = String(state.deviceSearch || "").trim().toLowerCase();
    if (state.deviceFilter !== "all" && item.status !== state.deviceFilter) return false;
    if (!search) return true;
    return [
      item.name,
      item.category,
      item.assetNo,
      item.location,
      item.owner,
      item.note,
      item.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  }

  function borrowMatchesView(item) {
    const search = String(state.borrowSearch || "").trim().toLowerCase();
    if (state.borrowFilter !== "all" && item.status !== state.borrowFilter) return false;
    if (!search) return true;
    return [
      item.applicant,
      item.deviceName,
      item.deviceId,
      item.purpose,
      item.status,
      item.returnStatus,
      item.approvedBy,
      item.note,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  }

  function syncDeviceView() {
    const items = getDeviceSourceItems().filter((item) => deviceMatchesView(item));
    state.deviceItems = items;
    renderDashboard();
    renderDevices();
    renderBorrowDeviceSelect();
    return items;
  }

  function syncBorrowView() {
    const items = getBorrowSourceItems().filter((item) => borrowMatchesView(item));
    state.borrowItems = items;
    renderDashboard();
    renderBorrowRequests();
    return items;
  }

  async function refreshDevices({ scope = "view", silent = false } = {}) {
    if (!state.session?.authenticated) return [];
    const endpoint =
      scope === "catalog"
        ? "/api/devices"
        : (() => {
            const query = buildDeviceQuery();
            return query ? `/api/devices?${query}` : "/api/devices";
          })();
    const result = await request(endpoint);
    const items = normalizeListResponse(result);
    if (scope === "catalog") {
      state.deviceCatalog = items;
      return syncDeviceView();
    }
    state.deviceItems = items;
    renderDevices();
    return items;
  }

  async function refreshBorrowRequests({ scope = "view", silent = false } = {}) {
    if (!state.session?.authenticated) return [];
    const endpoint =
      scope === "catalog"
        ? "/api/borrow-requests"
        : (() => {
            const query = buildBorrowQuery();
            return query ? `/api/borrow-requests?${query}` : "/api/borrow-requests";
          })();
    const result = await request(endpoint);
    const items = normalizeListResponse(result);
    if (scope === "catalog") {
      state.borrowCatalog = items;
      return syncBorrowView();
    }
    state.borrowItems = items;
    renderBorrowRequests();
    return items;
  }

  async function refreshKeyLists(options = {}) {
    await Promise.all([refreshDevices(options), refreshBorrowRequests(options)]);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 💬 模块 5：UI 反馈（面板提示 / Pending 状态）
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：在面板顶部显示操作反馈，控制按钮 disabled 状态
  // 调用方：所有 CRUD 操作
  // ═══════════════════════════════════════════════════════════════════════════════
  function showFeedback(text, tone = "info", view = state.activeView) {
    const panel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
    if (!panel) return;
    let node = panel.querySelector(".panel-feedback");
    if (!node) {
      node = document.createElement("div");
      node.className = "panel-feedback";
      panel.prepend(node);
    }
    node.dataset.tone = tone;
    node.textContent = text || "";
    clearTimeout(feedbackTimer);
    if (text) {
      feedbackTimer = window.setTimeout(() => {
        if (node.isConnected) {
          node.textContent = "";
          delete node.dataset.tone;
        }
      }, FEEDBACK_TTL);
    }
  }

  function clearFeedback(view = state.activeView) {
    const panel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
    const node = panel?.querySelector(".panel-feedback");
    if (!node) return;
    node.textContent = "";
    delete node.dataset.tone;
  }

  function setPending(pending) {
    state.actionPending = pending;
    [els.refreshBtn, els.logoutBtn, els.uploadBtn, els.syncBtn, els.deviceRefreshBtn, els.borrowRefreshBtn].forEach((btn) => {
      if (btn) btn.disabled = pending;
    });
    if (els.settingsSubmitBtn) els.settingsSubmitBtn.disabled = pending;
    if (els.todoForm) {
      $$("button, input, select", els.todoForm).forEach((el) => {
        el.disabled = pending;
      });
    }
    if (els.deviceForm) {
      $$("button, input, select", els.deviceForm).forEach((el) => {
        el.disabled = pending;
      });
    }
    if (els.borrowForm) {
      $$("button, input, select", els.borrowForm).forEach((el) => {
        el.disabled = pending;
      });
    }
    if (els.settingsForm) {
      $$("button, input, select", els.settingsForm).forEach((el) => {
        if (el !== els.settingsSubmitBtn) el.disabled = pending;
      });
    }
  }

  function setLoginPending(pending) {
    state.loginPending = pending;
    if (els.loginSubmit) {
      els.loginSubmit.disabled = pending;
      els.loginSubmit.dataset.originalText ||= els.loginSubmit.textContent || "";
      els.loginSubmit.textContent = pending ? "登录中..." : els.loginSubmit.dataset.originalText;
    }
    if (els.loginForm) {
      $$("input, button", els.loginForm).forEach((el) => {
        if (el !== els.loginSubmit) el.disabled = pending;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 📋 模块 6：日志上报（客户端错误采集）
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：捕获前端错误并通过 sendBeacon 上报到 /api/client-log
  // 调用方：window.error, unhandledrejection, 各 try/catch
  // ═══════════════════════════════════════════════════════════════════════════════
  function captureClientContext() {
    return {
      page: window.location.href,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      view: state.activeView,
      role: state.session?.user?.role || "guest",
    };
  }

  function postClientLog(payload) {
    const body = JSON.stringify({ ...captureClientContext(), ...payload });
    if (navigator.sendBeacon) {
      try {
        const ok = navigator.sendBeacon(CLIENT_LOG_ENDPOINT, new Blob([body], { type: "application/json" }));
        if (ok) return;
      } catch {
        // fallback below
      }
    }
    fetch(CLIENT_LOG_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function reportClientError(error, category = "client") {
    if (!error) return;
    postClientLog({
      category,
      message: error.message || String(error),
      payload: {
        stack: error.stack || "",
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🌐 模块 3：API 与网络（HTTP 请求封装 / CSRF token 注入 / cookie 读取）
  //
  // 详见：CODE_GUIDE.md → "模块 3：API 与网络"
  // ═══════════════════════════════════════════════════════════════════════════════
  function readCookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const csrfHeaders = {};
    if (method !== "GET" && method !== "HEAD") {
      const token = readCookie("ss_csrf");
      if (token) csrfHeaders["X-CSRF-Token"] = token;
    }
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders,
        ...(options.headers || {}),
      },
      ...options,
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const message = data?.error || data?.message || `请求失败：${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function requestJSON(path, options = {}) {
    return request(path, {
      ...options,
      body: options.body !== undefined ? JSON.stringify(options.body) : options.body,
    });
  }

  function setShellLoggedIn(authed) {
    if (els.authShell) els.authShell.classList.toggle("hidden", authed);
    if (els.workspaceShell) els.workspaceShell.classList.toggle("hidden", !authed);
    if (els.workspaceShell) els.workspaceShell.classList.toggle("is-ready", authed);
  }

  function updateNavIndicator() {
    const indicator = els.navIndicator;
    const nav = els.topnav;
    if (!indicator || !nav) return;
    const active = nav.querySelector(".nav-chip.is-active");
    if (!active) {
      indicator.style.opacity = "0";
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const btnRect = active.getBoundingClientRect();
    const left = btnRect.left - navRect.left + nav.scrollLeft;
    indicator.style.opacity = "1";
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translateX(${left}px)`;
  }

  function setActiveView(view) {
    const previousView = state.activeView;
    state.activeView = view;
    
    $$(`.nav-chip`).forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    
    // 更新滑动指示器
    requestAnimationFrame(() => updateNavIndicator());
    
    const previousPanel = document.querySelector(`.workspace-panel[data-panel="${previousView}"]`);
    const nextPanel = document.querySelector(`.workspace-panel[data-panel="${view}"]`);
    
    // 纯 CSS 驱动的面板切换 - 移除所有 inline style
    if (previousPanel && previousPanel !== nextPanel) {
      previousPanel.classList.remove("active");
    }
    
    if (nextPanel) {
      nextPanel.classList.add("active");
      // 重置子元素动画（重新触发 stagger）
      nextPanel.querySelectorAll(":scope > *").forEach((child) => {
        child.style.animation = "none";
        // 强制重排
        void child.offsetHeight;
        child.style.animation = "";
      });
    }
    
    if (view !== "settings") {
      closeProfilePopover();
    }
    clearFeedback(view);
    // 瞬时滚动避免与动画冲突
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function triggerShortcut(action) {
    if (!action) return;
    if (action.startsWith("jump-")) {
      setActiveView(action.replace("jump-", ""));
      return;
    }
    if (action === "upload") {
      setActiveView("media");
      els.uploadBtn?.click();
      return;
    }
    if (action === "sync") {
      setActiveView("media");
      els.syncBtn?.click();
      return;
    }
    if (action === "backup") {
      window.open("/api/backup", "_blank", "noopener");
      return;
    }
  }

  function openProfilePopover() {
    if (!els.profilePopover) return;
    els.profilePopover.hidden = false;
    els.userAvatarBtn?.setAttribute("aria-expanded", "true");
  }

  function closeProfilePopover() {
    if (!els.profilePopover) return;
    els.profilePopover.hidden = true;
    els.userAvatarBtn?.setAttribute("aria-expanded", "false");
  }

  function applyNavMode(mode) {
    if (!els.topnav) return;
    const useCompact = mode === "auto" && window.matchMedia("(max-width: 900px)").matches;
    els.topnav.classList.toggle("is-compact", useCompact);
    els.topnav.dataset.navMode = mode;
    requestAnimationFrame(() => updateNavIndicator());
  }

  function syncProfileUI() {
    const user = state.session?.user;
    const stored = state.profile;
    const displayName = stored.displayName || user?.username || "";
    const signature = stored.signature || "工作台成员";
    const role = user?.role || "guest";
    const initials = getInitials(displayName);

    if (els.userAvatarInitials) els.userAvatarInitials.textContent = initials;
    if (els.avatarTooltip) els.avatarTooltip.textContent = `${displayName || "未登录"} · ${signature}`;
    if (els.profileAvatarPreview) els.profileAvatarPreview.textContent = initials;
    if (els.profilePreviewName) els.profilePreviewName.textContent = displayName || "-";
    if (els.profilePreviewSignature) els.profilePreviewSignature.textContent = signature;
    if (els.profileAccountName) els.profileAccountName.textContent = user?.username || "-";
    if (els.profileAccountRole) els.profileAccountRole.textContent = getRoleLabel(role);
    
    // 优化：显示角色标识而非重复的"工作台概览"
    if (els.rolePill) {
      els.rolePill.textContent = role === "admin" ? "管理员工作台" : "成员工作台";
    }
    
    // 优化：显示个性化欢迎语
    if (els.roleTitle) {
      els.roleTitle.textContent = displayName ? `欢迎回来，${displayName}` : "欢迎回来";
    }
    
    if (els.roleDescription) {
      els.roleDescription.textContent =
        role === "admin"
          ? "先看总览，再进入站点配置、素材审核、借出审批和设备管理。"
          : "先看总览，再切换到素材、审片、待办和借出申请。";
    }
    if (els.profileDisplayName) els.profileDisplayName.value = displayName;
    if (els.profileSignature) els.profileSignature.value = stored.signature || "";
    if (els.profileNavMode) els.profileNavMode.value = stored.navMode || "auto";
    if (els.settingsPanel) els.settingsPanel.hidden = role !== "admin";
    if (els.settingsPanel) els.settingsPanel.style.display = role === "admin" ? "" : "none";
    if (els.settingsNav) {
      els.settingsNav.hidden = role !== "admin";
      els.settingsNav.style.display = role === "admin" ? "" : "none";
    }
    window.shengshengSession = user ? { role: user.role, username: user.username } : null;
    window.dispatchEvent(new CustomEvent("shengsheng:session", { detail: window.shengshengSession }));
    applyNavMode(stored.navMode || "auto");
  }

  function loadStoredProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.profile = {
        displayName: parsed.displayName || "",
        signature: parsed.signature || "",
        navMode: parsed.navMode || "auto",
      };
    } catch {
      // ignore
    }
  }

  function saveStoredProfile() {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(state.profile));
  }

  function renderDashboard() {
    const dashboardCounts = state.bootstrap?.dashboard?.counts || {};
    const counts = {
      ...dashboardCounts,
      devices: Array.isArray(state.deviceCatalog) ? state.deviceCatalog.length : dashboardCounts.devices ?? 0,
      borrowOpen: Array.isArray(state.borrowCatalog)
        ? state.borrowCatalog.filter((item) => item.status === "pending").length
        : dashboardCounts.borrowOpen ?? 0,
    };
    
    // 更新日期时间徽章
    const dateBadge = document.getElementById("overview-date-badge");
    if (dateBadge) {
      const now = new Date();
      const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
      const monthDay = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
      const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      dateBadge.innerHTML = `<span class="date-day">${weekday}</span><span class="date-md">${monthDay}</span><span class="date-time">${time}</span>`;
    }
    
    // 提醒徽章
    const alertsEl = document.getElementById("overview-alerts");
    if (alertsEl) {
      const overdueCount = (state.borrowCatalog || []).filter(
        (b) => b.status === "approved" && isOverdue(b.expectedReturnAt, b.returnStatus)
      ).length;
      const alerts = [
        { tone: "pending", value: counts.pending ?? 0, label: "待审素材", target: "review" },
        { tone: "todo", value: counts.todoOpen ?? 0, label: "未完待办", target: "todo" },
        { tone: "danger", value: overdueCount, label: "逾期借出", target: "borrow" },
      ];
      alertsEl.innerHTML = alerts
        .map(
          (a) => `
          <button class="alert-chip" data-jump="${escapeHtml(a.target)}" data-tone="${escapeHtml(a.tone)}" type="button" ${a.value > 0 ? 'data-active="true"' : ""}>
            <span class="alert-value">${escapeHtml(a.value)}</span>
            <span class="alert-label">${escapeHtml(a.label)}</span>
            ${a.value > 0 ? '<span class="alert-pulse" aria-hidden="true"></span>' : ""}
          </button>
        `,
        )
        .join("");
    }
    
    const items = [
      { label: "素材总数", value: counts.all ?? 0, jump: "media", tone: "neutral" },
      { label: "待审", value: counts.pending ?? 0, jump: "review", tone: "warning" },
      { label: "已通过", value: counts.approved ?? 0, jump: "media", tone: "success" },
      { label: "待办", value: counts.todoOpen ?? 0, jump: "todo", tone: "info" },
      { label: "设备", value: counts.devices ?? 0, jump: "device", tone: "neutral" },
      { label: "借出", value: counts.borrowOpen ?? 0, jump: "borrow", tone: "primary" },
    ];

    if (els.dashboardStats) {
      els.dashboardStats.innerHTML = items
        .map(
          (item, idx) => `
            <li data-jump="${escapeHtml(item.jump)}" data-tone="${escapeHtml(item.tone)}" tabindex="0" role="button" aria-label="跳转到${escapeHtml(item.label)}" style="--stat-index:${idx}">
              <strong>${escapeHtml(item.value)}</strong>
              <span>${escapeHtml(item.label)}</span>
              ${item.value > 0 && (item.tone === "warning" || item.tone === "primary") ? '<span class="stat-dot" aria-hidden="true"></span>' : ""}
            </li>
          `,
        )
        .join("");
    }
    
    // 今日重点：最新待审 / 未完成待办 / 即将归还
    const focusEl = document.getElementById("overview-focus");
    if (focusEl) {
      const pendingMedia = (state.bootstrap?.media || [])
        .filter((m) => m.reviewState === "pending")
        .slice(0, 3);
      const openTodos = (state.bootstrap?.todos || [])
        .filter((t) => !t.done)
        .slice(0, 3);
      const upcomingBorrows = (state.borrowCatalog || [])
        .filter((b) => b.status === "approved" && b.returnStatus !== "returned")
        .sort((a, b) => (a.expectedReturnAt || "").localeCompare(b.expectedReturnAt || ""))
        .slice(0, 3);
      
      focusEl.innerHTML = `
        <article class="focus-card" data-tone="warning">
          <div class="focus-head">
            <p class="eyebrow">最新待审</p>
            <button class="focus-link" data-jump="review" type="button">全部 →</button>
          </div>
          <div class="focus-body">
            ${
              pendingMedia.length
                ? pendingMedia
                    .map(
                      (m) => `
                  <div class="focus-row">
                    <img class="focus-thumb" src="${escapeHtml(m.thumb || "")}" alt="" loading="lazy" />
                    <div class="focus-text">
                      <strong>${escapeHtml(m.title || "未命名")}</strong>
                      <small>${escapeHtml(m.author || "-")} · ${escapeHtml(m.kind || "")}</small>
                    </div>
                  </div>
                `,
                    )
                    .join("")
                : '<p class="focus-empty">没有待审素材</p>'
            }
          </div>
        </article>
        <article class="focus-card" data-tone="info">
          <div class="focus-head">
            <p class="eyebrow">未完成待办</p>
            <button class="focus-link" data-jump="todo" type="button">全部 →</button>
          </div>
          <div class="focus-body">
            ${
              openTodos.length
                ? openTodos
                    .map(
                      (t) => `
                  <div class="focus-row">
                    <span class="focus-priority" data-priority="${escapeHtml(t.priority || "中")}">${escapeHtml(t.priority || "中")}</span>
                    <div class="focus-text">
                      <strong>${escapeHtml(t.title || "")}</strong>
                    </div>
                  </div>
                `,
                    )
                    .join("")
                : '<p class="focus-empty">所有待办已完成</p>'
            }
          </div>
        </article>
        <article class="focus-card" data-tone="primary">
          <div class="focus-head">
            <p class="eyebrow">即将归还</p>
            <button class="focus-link" data-jump="borrow" type="button">全部 →</button>
          </div>
          <div class="focus-body">
            ${
              upcomingBorrows.length
                ? upcomingBorrows
                    .map((b) => {
                      const overdue = isOverdue(b.expectedReturnAt, b.returnStatus);
                      return `
                  <div class="focus-row" ${overdue ? 'data-overdue="true"' : ""}>
                    <span class="focus-icon" aria-hidden="true">📦</span>
                    <div class="focus-text">
                      <strong>${escapeHtml(b.deviceName || b.deviceId || "-")}</strong>
                      <small>${escapeHtml(b.applicant || "")} · ${overdue ? "已逾期" : "归还 " + escapeHtml(formatDatetime(b.expectedReturnAt))}</small>
                    </div>
                  </div>
                `;
                    })
                    .join("")
                : '<p class="focus-empty">没有借出中的设备</p>'
            }
          </div>
        </article>
      `;
    }
    
    // 快捷操作区
    const shortcutsEl = document.getElementById("overview-shortcuts");
    if (shortcutsEl && !shortcutsEl.dataset.bound) {
      const shortcuts = [
        { icon: "📤", label: "上传素材", action: "upload" },
        { icon: "✓", label: "进入审片", action: "jump-review" },
        { icon: "📋", label: "添加待办", action: "jump-todo" },
        { icon: "📦", label: "登记设备", action: "jump-device" },
        { icon: "🔄", label: "同步照片", action: "sync" },
        { icon: "⬇", label: "下载备份", action: "backup" },
      ];
      shortcutsEl.innerHTML = shortcuts
        .map(
          (s, idx) => `
          <button class="shortcut-btn" data-shortcut="${escapeHtml(s.action)}" type="button" style="--idx:${idx}">
            <span class="shortcut-icon" aria-hidden="true">${s.icon}</span>
            <span class="shortcut-label">${escapeHtml(s.label)}</span>
          </button>
        `,
        )
        .join("");
      shortcutsEl.dataset.bound = "1";
    }

    const activity = state.bootstrap?.activity || [];
    if (els.activityList) {
      els.activityList.innerHTML = activity.length
        ? `<ol class="timeline">${activity
            .map(
              (item, idx) => `
                <li class="timeline-item" style="--idx:${idx}">
                  <span class="timeline-dot" aria-hidden="true"></span>
                  <article class="activity-item">
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.meta || "")}</p>
                    <small>${escapeHtml(item.detail || "")}</small>
                  </article>
                </li>
              `,
            )
            .join("")}</ol>`
        : `<div class="empty-state">暂无动态</div>`;
    }
  }

  function mediaMatchesFilter(item) {
    const filter = state.mediaFilter;
    if (filter === "all") return true;
    if (filter === "pending") return item.reviewState === "pending";
    if (filter === "approved") return item.reviewState === "approved";
    return item.kind === filter;
  }

  function matchesSearch(item, search) {
    if (!search) return true;
    const source = [item.title, item.source, item.author, ...(item.tags || []), item.note]
      .join(" ")
      .toLowerCase();
    return source.includes(search.toLowerCase());
  }

  function renderMedia() {
    let items = (state.bootstrap?.media || [])
      .filter((item) => mediaMatchesFilter(item) && matchesSearch(item, state.mediaSearch))
      .map((item) => ({
        ...item,
        statusLabel: item.reviewState === "approved" ? "已通过" : item.reviewState === "rejected" ? "退回" : "待审",
      }));

    items = sortMedia(items, state.mediaSort);
    const selectedCount = state.selectedMedia.size;
    const hasSelection = selectedCount > 0;

    if (!els.mediaGrid) return;
    
    const batchActionsHtml = hasSelection
      ? `<div class="batch-actions-bar">
          <span>${selectedCount} 项已选</span>
          <div class="batch-actions">
            <button class="primary-btn" data-batch-action="approve" type="button">批量通过</button>
            <button class="ghost-btn" data-batch-action="reject" type="button">批量退回</button>
            <button class="ghost-btn" data-batch-action="clear" type="button">取消选择</button>
          </div>
        </div>`
      : "";

    els.mediaGrid.innerHTML = batchActionsHtml + (items.length
      ? items
          .map(
            (item) => {
              const isSelected = state.selectedMedia.has(item.id);
              return `
              <article class="media-card ${isSelected ? "is-selected" : ""}" data-media-id="${escapeHtml(item.id)}">
                <div class="media-select-overlay">
                  <input type="checkbox" class="media-checkbox" data-media-select="${escapeHtml(item.id)}" ${isSelected ? "checked" : ""} />
                </div>
                <img class="media-thumb" alt="${escapeHtml(item.title)}" loading="lazy" src="${escapeHtml(item.thumb || "")}" />
                <div class="media-body">
                  <div class="media-topline">
                    <h3>${escapeHtml(item.title)}</h3>
                    <span class="status-pill" data-status="${escapeHtml(item.reviewState)}">${escapeHtml(item.statusLabel)}</span>
                  </div>
                  <p class="media-meta">${escapeHtml(item.source)} · ${escapeHtml(item.author)} · ${escapeHtml(item.kind)}</p>
                  ${item.uploadedAt ? `<p class="media-meta"><small>上传于 ${escapeHtml(formatDatetime(item.uploadedAt))}</small></p>` : ""}
                  <p class="media-note">${escapeHtml(item.note || "")}</p>
                  <div class="tag-row">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
                  <div class="media-actions">
                    ${
                      item.reviewState === "pending"
                        ? `<button class="primary-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button">通过</button>
                           <button class="ghost-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button">退回</button>`
                        : item.reviewState === "approved"
                        ? `<button class="ghost-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button">撤回</button>`
                        : `<button class="ghost-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button">重新通过</button>`
                    }
                  </div>
                </div>
              </article>
            `;
            }
          )
          .join("")
      : `<div class="empty-state"><strong>没有找到符合条件的素材</strong><p>可以尝试清空筛选条件，或者 <button class="link-btn" type="button" data-jump="media">上传新素材</button>。</p></div>`);
  }

  function reviewItems() {
    let items = (state.bootstrap?.media || []).filter((item) => reviewMatchesFilter(item));
    return sortReview(items, state.reviewSort);
  }

  function renderReview() {
    const items = reviewItems();
    const stats = getReviewStats();
    if (els.reviewCount) {
      els.reviewCount.textContent = `${items.length} 条待处理 (图片: ${stats.image}, 视频: ${stats.video})`;
    }
    if (!els.reviewStack) return;
    els.reviewStack.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <article class="review-item">
                <img src="${escapeHtml(item.thumb || "")}" alt="${escapeHtml(item.title)}" loading="lazy" />
                <div class="review-copy">
                  <div class="review-head">
                    <div>
                      <h3>${escapeHtml(item.title)}</h3>
                      <p class="review-meta">${escapeHtml(item.source)} · ${escapeHtml(item.author)} · ${escapeHtml(item.kind)}</p>
                      ${item.uploadedAt ? `<p class="review-meta"><small>上传于 ${escapeHtml(formatDatetime(item.uploadedAt))}</small></p>` : ""}
                    </div>
                    <span class="status-pill">待审</span>
                  </div>
                  ${item.note ? `<p class="review-note">${escapeHtml(item.note)}</p>` : ""}
                  <label class="field review-note-field">
                    <span>审片备注</span>
                    <textarea class="review-note-input" data-review-note-for="${escapeHtml(item.id)}" rows="2" placeholder="可选：填写通过或退回说明"></textarea>
                  </label>
                  <div class="tag-row">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
                  <div class="review-actions">
                    <button class="primary-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button">✓ 通过</button>
                    <button class="ghost-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button">✗ 退回</button>
                  </div>
                </div>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state"><strong>当前没有待审素材</strong><p>所有素材都已处理完成。<button class="link-btn" type="button" data-jump="media">去素材库上传</button> 或等待服务器同步。</p></div>`;
  }

  function getReviewStats() {
    const items = (state.bootstrap?.media || []).filter((item) => item.reviewState === "pending");
    return {
      total: items.length,
      image: items.filter((item) => item.kind === "photo").length,
      video: items.filter((item) => item.kind === "video").length,
    };
  }

  function todoDayKey(d) {
    return new Date(d).setHours(0, 0, 0, 0);
  }

  function classifyTodoByDate(todo, todayKey) {
    if (todo.done) return "done";
    if (!todo.dueDate) return "later";
    const due = todoDayKey(`${todo.dueDate}T00:00:00`);
    const diffDays = Math.round((due - todayKey) / 86400000);
    if (diffDays < 0) return "overdue";
    if (diffDays === 0) return "today";
    if (diffDays <= 6) return "this-week";
    return "later";
  }

  function formatDueLabel(todo, todayKey) {
    if (!todo.dueDate) return "未排期";
    const due = todoDayKey(`${todo.dueDate}T00:00:00`);
    const diffDays = Math.round((due - todayKey) / 86400000);
    if (diffDays < 0) return `已逾期 ${-diffDays} 天`;
    if (diffDays === 0) return "今日截止";
    if (diffDays === 1) return "明天截止";
    if (diffDays <= 6) return `${diffDays} 天后截止`;
    const dt = new Date(`${todo.dueDate}T00:00:00`);
    return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日截止`;
  }

  function getAssigneeName(assigneeId) {
    if (!assigneeId) return null;
    const team = state.bootstrap?.team || [];
    const member = team.find((m) => m.id === assigneeId);
    return member ? member.name : null;
  }

  function syncTodoAssigneeOptions() {
    if (!els.todoAssigneeSelect) return;
    const team = state.bootstrap?.team || [];
    const current = els.todoAssigneeSelect.value;
    els.todoAssigneeSelect.innerHTML =
      `<option value="">未分配</option>` +
      team
        .map(
          (m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`,
        )
        .join("");
    if (current && team.some((m) => m.id === current)) {
      els.todoAssigneeSelect.value = current;
    }
  }

  function renderTodos() {
    const items = state.bootstrap?.todos || [];
    syncTodoAssigneeOptions();
    const openCount = items.filter((item) => !item.done).length;
    if (els.todoOpenCount) els.todoOpenCount.textContent = `${openCount} 项未完成`;
    if (!els.todoList) return;

    if (!items.length) {
      els.todoList.innerHTML = `<div class="empty-state">暂时没有待办事项</div>`;
      return;
    }

    const todayKey = todoDayKey(new Date());
    const groups = { overdue: [], today: [], "this-week": [], later: [], done: [] };
    items.forEach((it) => {
      groups[classifyTodoByDate(it, todayKey)].push(it);
    });

    // 组内排序
    const byDueAsc = (a, b) => {
      const ad = a.dueDate || "9999-12-31";
      const bd = b.dueDate || "9999-12-31";
      return ad.localeCompare(bd);
    };
    groups.overdue.sort(byDueAsc); // 最久逾期在前
    groups.today.sort(byDueAsc);
    groups["this-week"].sort(byDueAsc);
    groups.later.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    groups.done.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

    const groupMeta = [
      { key: "overdue", label: "逾期", tone: "overdue" },
      { key: "today", label: "今日截止", tone: "today" },
      { key: "this-week", label: "本周内", tone: "" },
      { key: "later", label: "以后 / 未排期", tone: "" },
      { key: "done", label: "已完成", tone: "done" },
    ];

    const renderCard = (item) => {
      const assignee = getAssigneeName(item.assigneeId);
      const dueLabel = formatDueLabel(item, todayKey);
      const dueState =
        item.done ? "done" : !item.dueDate ? "none" : classifyTodoByDate(item, todayKey);
      return `
        <article class="todo-item ${item.done ? "is-done" : ""}" data-todo-id="${escapeHtml(item.id)}">
          <label class="todo-check" data-todo-edit-skip>
            <input type="checkbox" data-todo-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} />
            <span></span>
          </label>
          <div class="todo-body">
            <strong>${escapeHtml(item.title)}</strong>
            <div class="todo-meta">
              <span class="todo-meta-priority" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}优先</span>
              <span class="todo-meta-due" data-state="${escapeHtml(dueState)}">${escapeHtml(dueLabel)}</span>
              ${assignee ? `<span class="todo-assignee-chip">${escapeHtml(assignee)}</span>` : ""}
            </div>
          </div>
          <div class="todo-actions" data-todo-edit-skip>
            <button class="ghost-btn" data-todo-delete="${escapeHtml(item.id)}" type="button">删除</button>
          </div>
        </article>
      `;
    };

    const overdueCount = groups.overdue.length;
    const alertBar = overdueCount
      ? `<button class="todo-alert-bar" type="button" data-todo-alert>⚠ ${overdueCount} 项已逾期，点击查看</button>`
      : "";

    const sections = groupMeta
      .filter((g) => groups[g.key].length || g.key === "today" || g.key === "overdue")
      .map((g) => {
        const list = groups[g.key];
        if (!list.length && g.key !== "overdue" && g.key !== "today") return "";
        const collapsed = g.key === "done" ? "data-collapsed" : "";
        const tone = g.tone ? `data-tone="${g.tone}"` : "";
        const headerCount = list.length;
        return `
          <section class="todo-group" data-group="${g.key}" ${tone} ${collapsed}>
            <header class="todo-group-head">
              <h3>${g.label} <span class="todo-group-count">${headerCount}</span></h3>
            </header>
            <div class="todo-group-list">
              ${list.length ? list.map(renderCard).join("") : `<div class="todo-group-empty">无</div>`}
            </div>
          </section>
        `;
      })
      .join("");

    els.todoList.innerHTML = `
      <div class="todo-board">
        ${alertBar}
        ${sections}
      </div>
    `;
  }

  function deviceStatusLabel(status) {
    if (status === "borrowed") return "已借出";
    if (status === "maintenance") return "维护中";
    return "可借";
  }

  function renderDevices() {
    const items = Array.isArray(state.deviceItems) ? state.deviceItems : [];
    const stats = getDeviceStats();
    if (els.deviceCount) {
      els.deviceCount.textContent = `${items.length} 台设备 (可借: ${stats.available}, 借出: ${stats.borrowed}, 维护: ${stats.maintenance})`;
    }
    if (!els.deviceList) return;

    els.deviceList.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <article class="device-item" data-status="${escapeHtml(item.status)}">
                <div class="device-head">
                  <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>${escapeHtml(item.category)} · ${escapeHtml(item.assetNo)}</p>
                  </div>
                  <span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(deviceStatusLabel(item.status))}</span>
                </div>
                <div class="device-meta">
                  <span>位置：${escapeHtml(item.location || "-")}</span>
                  <span>责任人：${escapeHtml(item.owner || "-")}</span>
                </div>
                <small class="device-note">${escapeHtml(item.note || "")}</small>
                <div class="device-actions">
                  <button class="ghost-btn" data-device-edit="${escapeHtml(item.id)}" type="button">编辑</button>
                  <button class="ghost-btn" data-device-delete="${escapeHtml(item.id)}" type="button">删除</button>
                </div>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state"><strong>没有设备记录</strong><p>点击上方"保存设备"按钮添加第一台设备。</p></div>`;
  }

  function renderBorrowRequests() {
    const items = Array.isArray(state.borrowItems) ? state.borrowItems : [];
    const stats = getBorrowStats();
    if (els.borrowCount) {
      els.borrowCount.textContent = `${items.length} 条申请 (待审: ${stats.pending}, 借出中: ${stats.approved}, 逾期: ${stats.overdue})`;
    }
    if (!els.borrowList) return;
    els.borrowList.innerHTML = items.length
      ? items
          .map(
            (item) => {
              const overdue = isOverdue(item.expectedReturnAt, item.returnStatus);
              return `
              <article class="borrow-item" data-status="${escapeHtml(item.status)}" ${overdue ? 'data-overdue="true"' : ''}>
                <div class="borrow-head">
                  <div>
                    <h3>${escapeHtml(item.applicant)}</h3>
                    <p>${escapeHtml(item.deviceName || item.deviceId)} · ${escapeHtml(item.purpose)}</p>
                  </div>
                  <span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(item.status === "pending" ? "待审批" : item.status === "approved" ? "已通过" : item.status === "rejected" ? "已拒绝" : item.status)}</span>
                </div>
                <div class="borrow-meta">
                  <span>借出：${escapeHtml(formatDatetime(item.borrowAt))}</span>
                  <span ${overdue ? 'style="color: var(--danger); font-weight: 600;"' : ""}>预计归还：${escapeHtml(formatDatetime(item.expectedReturnAt))}${overdue ? " ⚠️ 已逾期" : ""}</span>
                  <span>归还状态：${escapeHtml(item.returnStatus === "returned" ? "已归还" : item.returnStatus === "not_returned" ? "未归还" : item.returnStatus || "-")}</span>
                </div>
                ${item.approvedBy ? `<small class="borrow-note">审批人：${escapeHtml(item.approvedBy)} · ${escapeHtml(formatDatetime(item.approvedAt))}</small>` : ""}
                ${item.note ? `<small class="borrow-note">${escapeHtml(item.note)}</small>` : ""}
                <div class="borrow-actions">
                  ${
                    state.session?.user?.role === "admin" && item.status === "pending"
                      ? `
                        <button class="primary-btn" data-borrow-action="approved" data-id="${escapeHtml(item.id)}" type="button">通过</button>
                        <button class="ghost-btn" data-borrow-action="rejected" data-id="${escapeHtml(item.id)}" type="button">拒绝</button>
                      `
                      : ""
                  }
                  ${
                    state.session?.user?.role === "admin" && item.status === "approved" && item.returnStatus !== "returned"
                      ? `<button class="ghost-btn" data-borrow-action="returned" data-id="${escapeHtml(item.id)}" type="button">确认归还</button>`
                      : ""
                  }
                </div>
              </article>
            `;
            }
          )
          .join("")
      : `<div class="empty-state"><strong>没有借出申请</strong><p>填写上方表单提交第一个借出申请。</p></div>`;
  }

  function sortTeam(items) {
    const sorted = [...items];
    switch (state.teamSort) {
      case "name":
        return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      case "joinedAt-desc":
        return sorted.sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
      case "joinedAt-asc":
        return sorted.sort((a, b) => (a.joinedAt || "").localeCompare(b.joinedAt || ""));
      case "role":
        return sorted.sort((a, b) => (a.role || "").localeCompare(b.role || ""));
      default:
        return sorted;
    }
  }

  function renderTeam() {
    let items = (state.bootstrap?.team || []).filter((item) => {
      if (state.teamFilter !== "all" && item.status !== state.teamFilter) return false;
      if (!state.teamSearch) return true;
      const search = state.teamSearch.toLowerCase();
      return [item.name, item.role, item.note, item.email, item.phone].join(" ").toLowerCase().includes(search);
    });
    
    items = sortTeam(items);
    
    const stats = {
      total: (state.bootstrap?.team || []).length,
      active: (state.bootstrap?.team || []).filter((t) => t.status === "active").length,
      leave: (state.bootstrap?.team || []).filter((t) => t.status === "leave").length,
      inactive: (state.bootstrap?.team || []).filter((t) => t.status === "inactive").length,
    };
    
    if (els.teamCount) els.teamCount.textContent = `${stats.total} 位成员 (在职: ${stats.active}, 休假: ${stats.leave}, 离职: ${stats.inactive})`;
    
    if (els.teamStats) {
      const activePercent = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;
      els.teamStats.innerHTML = `
        <div class="stat-card" data-tone="success" data-filter="active" role="button" tabindex="0">
          <strong>${stats.active}</strong>
          <span>在职成员 (${activePercent}%)</span>
        </div>
        <div class="stat-card" data-tone="warning" data-filter="leave" role="button" tabindex="0">
          <strong>${stats.leave}</strong>
          <span>休假中</span>
        </div>
        <div class="stat-card" data-tone="neutral" data-filter="inactive" role="button" tabindex="0">
          <strong>${stats.inactive}</strong>
          <span>已离职</span>
        </div>
      `;
    }
    
    const isAdmin = state.session?.user?.role === "admin";
    if (!els.teamGrid) return;
    els.teamGrid.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <article class="team-card" data-status="${escapeHtml(item.status || 'active')}" data-team-id="${escapeHtml(item.id)}">
                <div class="team-head">
                  <span class="team-badge">${escapeHtml(item.badge || item.name?.slice(0, 1) || "团")}</span>
                  <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>${escapeHtml(item.role)}</p>
                  </div>
                  <span class="team-status-dot" data-status="${escapeHtml(item.status || 'active')}" title="${item.status === 'active' ? '在职' : item.status === 'leave' ? '休假' : '离职'}"></span>
                </div>
                <small class="team-note">${escapeHtml(item.note || "暂无职责描述")}</small>
                <div class="team-meta">
                  ${item.email ? `<span>📧 ${escapeHtml(item.email)}</span>` : ""}
                  ${item.phone ? `<span>📱 ${escapeHtml(item.phone)}</span>` : ""}
                  ${item.joinedAt ? `<span>📅 入职 ${escapeHtml(formatDatetime(item.joinedAt).split(' ')[0])}</span>` : ""}
                </div>
                <div class="team-actions">
                  ${isAdmin ? `<button class="ghost-btn" data-team-move-up="${escapeHtml(item.id)}" type="button" title="上移">↑</button><button class="ghost-btn" data-team-move-down="${escapeHtml(item.id)}" type="button" title="下移">↓</button>` : ""}
                  <button class="ghost-btn" data-team-edit="${escapeHtml(item.id)}" type="button">编辑</button>
                  <button class="ghost-btn" data-team-delete="${escapeHtml(item.id)}" type="button">删除</button>
                </div>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state"><strong>没有找到团队成员</strong><p>可以尝试清空筛选条件。</p></div>`;
  }

  function renderSettings() {
    const settings = state.bootstrap?.settings || {};
    if (els.settingsForm) {
      const form = els.settingsForm;
      if (form.siteTitle) form.siteTitle.value = settings.siteTitle || "";
      if (form.siteSubtitle) form.siteSubtitle.value = settings.siteSubtitle || "";
      if (form.homeHeroMessage) form.homeHeroMessage.value = settings.homeHeroMessage || "";
      if (form.publicUrl) form.publicUrl.value = settings.publicUrl || "";
      if (form.adminUsername) form.adminUsername.value = settings.adminUsername || "";
      if (form.adminPassword) form.adminPassword.value = "";
    }

    if (els.systemCard) {
      const sys = state.bootstrap?.system || {};
      const publicUrl = settings.publicUrl || "";
      const hasPublicUrl = publicUrl.trim().length > 0;
      
      els.systemCard.innerHTML = `
        <div class="system-row"><span>数据库</span><strong>${escapeHtml(sys.databasePath || "-")}</strong></div>
        <div class="system-row"><span>上传目录</span><strong>${escapeHtml(sys.uploadDir || "-")}</strong></div>
        <div class="system-row"><span>自动扫描</span><strong>${escapeHtml(sys.inboxAutoScanSeconds ?? "-")} 秒</strong></div>
        <div class="system-row"><span>上传上限</span><strong>${escapeHtml(sys.maxUploadMb ?? "-")} MB</strong></div>
        <div class="system-row system-row-highlight">
          <span>公开地址</span>
          <div class="system-value-with-action">
            <strong>${hasPublicUrl ? escapeHtml(publicUrl) : "未配置"}</strong>
            ${hasPublicUrl ? `<button class="copy-btn" data-copy-text="${escapeHtml(publicUrl)}" type="button" title="复制地址">📋</button>` : ""}
          </div>
        </div>
      `;
    }
  }

  function renderBorrowDeviceSelect() {
    if (!els.borrowDeviceSelect) return;
    const devices = getAvailableBorrowDevices();
    els.borrowDeviceSelect.innerHTML = devices.length
      ? devices
          .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(deviceStatusLabel(item.status))}</option>`)
          .join("")
      : `<option value="">暂无可选设备</option>`;
  }

  function renderAll() {
    if (!state.bootstrap) return;
    if (els.siteTitle) els.siteTitle.textContent = state.bootstrap.site?.title || state.bootstrap.settings?.siteTitle || "工作台";
    if (els.homeHeroMessage) els.homeHeroMessage.textContent = state.bootstrap.site?.homeHeroMessage || "这里显示管理员配置的首页说明。";

    renderDashboard();
    renderMedia();
    renderReview();
    renderTodos();
    renderDevices();
    renderBorrowRequests();
    renderTeam();
    renderSettings();
    renderBorrowDeviceSelect();
    syncProfileUI();
  }

  async function loadBootstrap() {
    state.bootstrap = await request("/api/bootstrap");
    state.deviceCatalog = Array.isArray(state.bootstrap.devices) ? state.bootstrap.devices : [];
    state.borrowCatalog = Array.isArray(state.bootstrap.borrowRequests) ? state.bootstrap.borrowRequests : [];
    syncDeviceView();
    syncBorrowView();
    renderAll();
  }

  async function refreshAll({ silent = false } = {}) {
    if (!state.session?.authenticated) return;
    try {
      setPending(true);
      if (!silent) showFeedback("正在刷新工作台数据...", "loading", state.activeView);
      await loadBootstrap();
      if (!silent) showFeedback("已刷新最新数据", "success", state.activeView);
    } catch (error) {
      showFeedback(error.message || "刷新失败", "error", state.activeView);
      reportClientError(error, "refresh");
    } finally {
      setPending(false);
    }
  }

  async function loadSession() {
    try {
      const data = await request("/api/session");
      state.session = data.authenticated ? data : null;
      if (state.session?.authenticated) {
        setShellLoggedIn(true);
        syncProfileUI();
        try {
          await loadBootstrap();
        } catch (error) {
          showFeedback(error.message || "工作台数据加载失败，请稍后刷新。", "error", "overview");
          renderDashboard();
          renderMedia();
          renderReview();
          renderTodos();
          renderDevices();
          renderBorrowRequests();
          renderTeam();
          renderSettings();
          renderBorrowDeviceSelect();
          reportClientError(error, "bootstrap");
        }
      } else {
        setShellLoggedIn(false);
      }
    } catch (error) {
      setShellLoggedIn(false);
      reportClientError(error, "session");
    }
  }

  async function login(username, password) {
    setLoginPending(true);
    if (els.loginMessage) els.loginMessage.textContent = "";
    
    // 前端验证
    const errors = validateForm(els.loginForm, VALIDATION_RULES.login);
    if (errors.length > 0) {
      if (els.loginMessage) els.loginMessage.textContent = errors[0].message;
      setLoginPending(false);
      return;
    }
    
    try {
      const data = await requestJSON("/api/login", {
        method: "POST",
        body: { username, password },
      });
      state.session = data;
      setShellLoggedIn(true);
      await loadBootstrap();
      syncProfileUI();
      if (els.loginForm) els.loginForm.reset();
      showFeedback("登录成功，工作台已打开。", "success", "overview");
    } catch (error) {
      if (state.session?.authenticated) {
        setShellLoggedIn(true);
      }
      if (els.loginMessage) els.loginMessage.textContent = error.message || "登录失败";
      reportClientError(error, "login");
    } finally {
      setLoginPending(false);
    }
  }

  async function logout() {
    try {
      setPending(true);
      await requestJSON("/api/logout", { method: "POST", body: {} });
    } catch {
      // ignore
    } finally {
      state.session = null;
      state.bootstrap = null;
      setShellLoggedIn(false);
      setPending(false);
      showFeedback("已退出登录。", "info", "overview");
    }
  }

  function fillTodoFormReset() {
    if (els.todoForm) els.todoForm.reset();
  }

  function fillDeviceFormReset() {
    state.deviceEditingId = null;
    if (els.deviceForm) els.deviceForm.reset();
    if (els.deviceFormId) els.deviceFormId.value = "";
    if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = "保存设备";
    if (els.deviceFormCancel) els.deviceFormCancel.hidden = true;
  }

  function openDeviceForm(device) {
    if (!els.deviceForm) return;
    state.deviceEditingId = device?.id || null;
    const form = els.deviceForm;
    if (els.deviceFormId) els.deviceFormId.value = device?.id || "";
    if (form.elements.name) form.elements.name.value = device?.name || "";
    if (form.elements.category) form.elements.category.value = device?.category || "";
    if (form.elements.assetNo) form.elements.assetNo.value = device?.assetNo || "";
    if (form.elements.status) form.elements.status.value = device?.status || "available";
    if (form.elements.location) form.elements.location.value = device?.location || "";
    if (form.elements.owner) form.elements.owner.value = device?.owner || "";
    if (form.elements.note) form.elements.note.value = device?.note || "";
    if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = device ? "更新设备" : "保存设备";
    if (els.deviceFormCancel) els.deviceFormCancel.hidden = !device;
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function moveTeamMember(id, direction) {
    const team = [...(state.bootstrap?.team || [])].sort(
      (a, b) => (a.orderIndex || 0) - (b.orderIndex || 0),
    );
    const index = team.findIndex((member) => member.id === id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= team.length) return;
    const result = await requestJSON(`/api/team/${encodeURIComponent(id)}/order`, {
      method: "PATCH",
      body: { orderIndex: team[targetIndex].orderIndex },
    });
    state.bootstrap.team = normalizeListResponse(result);
    renderTeam();
  }

  function fillBorrowFormReset() {
    if (els.borrowForm) els.borrowForm.reset();
  }

  async function createTodo(formData) {
    const title = String(formData.get("title") || "").trim();
    const priority = String(formData.get("priority") || "中");
    const dueDate = String(formData.get("dueDate") || "").trim() || null;
    const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
    const item = await requestJSON("/api/todos", {
      method: "POST",
      body: { title, priority, dueDate, assigneeId },
    });
    state.bootstrap.todos = [item.item, ...(state.bootstrap.todos || [])];
    renderTodos();
    fillTodoFormReset();
  }

  async function toggleTodo(id, done) {
    const item = await requestJSON(`/api/todos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { done },
    });
    state.bootstrap.todos = (state.bootstrap.todos || []).map((row) => (row.id === id ? item.item : row));
    renderTodos();
  }

  async function deleteTodo(id) {
    await requestJSON(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
    state.bootstrap.todos = (state.bootstrap.todos || []).filter((row) => row.id !== id);
    renderTodos();
  }

  function validateUrl(url) {
    if (!url || url.trim().length === 0) return null; // 允许为空
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "公开地址必须以 http:// 或 https:// 开头";
      }
      return null;
    } catch {
      return "公开地址格式不正确，请输入完整的 URL（如 http://192.168.1.100:3001）";
    }
  }

  async function saveSettings(formData) {
    const publicUrl = String(formData.get("publicUrl") || "").trim();
    
    // 验证 URL 格式
    const urlError = validateUrl(publicUrl);
    if (urlError) {
      showFeedback(urlError, "error", "settings");
      if (els.settingsForm) {
        showFieldError(els.settingsForm, "publicUrl", urlError);
      }
      return;
    }
    
    const payload = {
      siteTitle: String(formData.get("siteTitle") || "").trim(),
      siteSubtitle: String(formData.get("siteSubtitle") || "").trim(),
      homeHeroMessage: String(formData.get("homeHeroMessage") || "").trim(),
      publicUrl,
      adminUsername: String(formData.get("adminUsername") || "").trim(),
      adminPassword: String(formData.get("adminPassword") || "").trim(),
    };
    const result = await requestJSON("/api/settings", {
      method: "PATCH",
      body: payload,
    });
    state.bootstrap.settings = result.settings;
    state.bootstrap.site = {
      ...(state.bootstrap.site || {}),
      title: result.settings.siteTitle,
      subtitle: result.settings.siteSubtitle,
      homeHeroMessage: result.settings.homeHeroMessage,
    };
    renderAll();
  }

  async function saveDevice(formData) {
    const payload = {
      name: String(formData.get("name") || "").trim(),
      category: String(formData.get("category") || "").trim(),
      assetNo: String(formData.get("assetNo") || "").trim(),
      status: String(formData.get("status") || "available"),
      location: String(formData.get("location") || "").trim(),
      owner: String(formData.get("owner") || "").trim(),
      note: String(formData.get("note") || "").trim(),
    };
    const editingId = state.deviceEditingId || String(formData.get("id") || "").trim();
    if (editingId) {
      const result = await requestJSON(`/api/devices/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: payload,
      });
      state.deviceCatalog = (state.deviceCatalog || []).map((row) => (row.id === editingId ? result.item : row));
    } else {
      const result = await requestJSON("/api/devices", {
        method: "POST",
        body: payload,
      });
      state.deviceCatalog = [result.item, ...(state.deviceCatalog || [])];
    }
    syncDeviceView();
    fillDeviceFormReset();
  }

  async function createDevice(formData) {
    return saveDevice(formData);
  }

  async function updateDevice(id, patch) {
    const result = await requestJSON(`/api/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
    state.deviceCatalog = (state.deviceCatalog || []).map((row) => (row.id === id ? result.item : row));
    syncDeviceView();
  }

  async function deleteDevice(id) {
    await requestJSON(`/api/devices/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: {},
    });
    state.deviceCatalog = (state.deviceCatalog || []).filter((row) => row.id !== id);
    syncDeviceView();
  }

  async function createBorrowRequest(formData) {
    const payload = {
      applicant: String(formData.get("applicant") || "").trim(),
      deviceId: String(formData.get("deviceId") || "").trim(),
      purpose: String(formData.get("purpose") || "").trim(),
      borrowAt: String(formData.get("borrowAt") || "").trim(),
      expectedReturnAt: String(formData.get("expectedReturnAt") || "").trim(),
      note: String(formData.get("note") || "").trim(),
    };
    const result = await requestJSON("/api/borrow-requests", {
      method: "POST",
      body: payload,
    });
    state.borrowCatalog = [result.item, ...(state.borrowCatalog || [])];
    syncBorrowView();
    fillBorrowFormReset();
  }

  async function updateBorrowRequest(id, patch) {
    const result = await requestJSON(`/api/borrow-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
    state.borrowCatalog = (state.borrowCatalog || []).map((row) => (row.id === id ? result.item : row));
    if (result.item?.deviceId) {
      await refreshDevices({ scope: "catalog" });
    } else {
      syncDeviceView();
    }
    syncBorrowView();
    renderBorrowDeviceSelect();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 👥 模块 7：团队协作 CRUD
  // ───────────────────────────────────────────────────────────────────────────────
  // 职责：团队成员的新增、编辑、删除及表单管理
  // ═══════════════════════════════════════════════════════════════════════════════
  function openTeamForm(member = null) {
    if (!els.teamForm) return;
    els.teamForm.hidden = false;
    els.teamForm.reset();
    state.teamEditingId = member?.id || null;
    if (els.teamFormId) els.teamFormId.value = member?.id || "";
    if (els.teamFormSubmit) {
      els.teamFormSubmit.textContent = member ? "更新成员" : "保存成员";
    }
    if (member) {
      const form = els.teamForm;
      if (form.name) form.name.value = member.name || "";
      if (form.role) form.role.value = member.role || "";
      if (form.note) form.note.value = member.note || "";
      if (form.badge) form.badge.value = member.badge || "";
      if (form.email) form.email.value = member.email || "";
      if (form.phone) form.phone.value = member.phone || "";
      if (form.status) form.status.value = member.status || "active";
      if (form.joinedAt) {
        // 处理 ISO 日期字符串：取 YYYY-MM-DD 部分
        const dateOnly = (member.joinedAt || "").split("T")[0].split(" ")[0];
        form.joinedAt.value = dateOnly || "";
      }
    }
    // 滚动到表单
    els.teamForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // 聚焦第一个输入框
    setTimeout(() => {
      const firstInput = els.teamForm.querySelector("input[name='name']");
      firstInput?.focus();
    }, 100);
  }

  function closeTeamForm() {
    if (!els.teamForm) return;
    els.teamForm.hidden = true;
    els.teamForm.reset();
    state.teamEditingId = null;
    if (els.teamFormId) els.teamFormId.value = "";
  }

  async function createTeamMember(formData) {
    const payload = {
      name: String(formData.get("name") || "").trim(),
      role: String(formData.get("role") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      badge: String(formData.get("badge") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      status: String(formData.get("status") || "active"),
      joinedAt: String(formData.get("joinedAt") || "").trim(),
    };
    const result = await requestJSON("/api/team", {
      method: "POST",
      body: payload,
    });
    state.bootstrap.team = [result.item, ...(state.bootstrap.team || [])];
    renderTeam();
  }

  async function updateTeamMember(id, formData) {
    const payload = {
      name: String(formData.get("name") || "").trim(),
      role: String(formData.get("role") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      badge: String(formData.get("badge") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      status: String(formData.get("status") || "active"),
      joinedAt: String(formData.get("joinedAt") || "").trim(),
    };
    const result = await requestJSON(`/api/team/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: payload,
    });
    state.bootstrap.team = (state.bootstrap.team || []).map((row) =>
      row.id === id ? result.item : row,
    );
    renderTeam();
  }

  async function deleteTeamMember(id) {
    await requestJSON(`/api/team/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: {},
    });
    state.bootstrap.team = (state.bootstrap.team || []).filter((row) => row.id !== id);
    renderTeam();
  }

  async function refreshTeam() {
    if (!state.session?.authenticated) return;
    const result = await request("/api/team");
    state.bootstrap.team = normalizeListResponse(result);
    renderTeam();
  }

  function getReviewNoteForItem(id) {
    const field = document.querySelector(`[data-review-note-for="${CSS.escape(id)}"]`);
    return field ? String(field.value || "").trim() : "";
  }

  async function reviewMedia(id, status, reviewNote = "") {
    const body = { status };
    if (reviewNote) body.reviewNote = reviewNote;

    const result = await requestJSON(`/api/media/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body,
    });
    state.bootstrap.media = (state.bootstrap.media || []).map((row) => (row.id === id ? result.item : row));
    renderMedia();
    renderReview();
  }

  async function syncMedia() {
    const result = await requestJSON("/api/media/sync", {
      method: "POST",
      body: {},
    });
    await loadBootstrap();
    showFeedback(`已同步 ${result.imported || 0} 条服务器照片`, "success", "media");
  }

  function attachRevealObserver() {
    if (revealObserver) return;
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "50px" },
    );
    $$(`.reveal`).forEach((node) => revealObserver.observe(node));
  }

  let lazyImageObserver = null;

  function attachLazyImageObserver() {
    if (lazyImageObserver) return;
    lazyImageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute("data-src");
            }
            lazyImageObserver.unobserve(img);
          }
        });
      },
      { threshold: 0.01, rootMargin: "100px" },
    );
  }

  function observeLazyImages() {
    if (!lazyImageObserver) attachLazyImageObserver();
    $$("img[data-src]").forEach((img) => lazyImageObserver.observe(img));
  }

  // 性能优化：使用 requestIdleCallback 延迟非关键任务
  function scheduleIdleTask(task) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(task, { timeout: 2000 });
    } else {
      setTimeout(task, 1);
    }
  }

  // 防抖优化：统一管理
  function createDebouncer() {
    const timers = new Map();
    return function(key, fn, delay = 300) {
      if (timers.has(key)) {
        clearTimeout(timers.get(key));
      }
      timers.set(key, setTimeout(() => {
        fn();
        timers.delete(key);
      }, delay));
    };
  }

  const debouncer = createDebouncer();

  // 输入验证规则
  const VALIDATION_RULES = cfg.VALIDATION_RULES || {
    login: {
      username: {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
        requiredMessage: "请输入用户名",
        patternMessage: "用户名只能包含字母、数字、下划线和中文"
      },
      password: {
        required: true,
        minLength: 6,
        maxLength: 100,
        requiredMessage: "请输入密码",
        minLengthMessage: "密码至少需要6个字符"
      }
    },
    device: {
      name: {
        required: true,
        minLength: 2,
        maxLength: 100,
        requiredMessage: "请输入设备名称",
        minLengthMessage: "设备名称至少需要2个字符"
      },
      category: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入设备类别"
      },
      assetNo: {
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: /^[A-Z0-9-]+$/,
        requiredMessage: "请输入设备编号",
        patternMessage: "设备编号只能包含大写字母、数字和连字符"
      }
    },
    borrow: {
      applicant: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入申请人姓名"
      },
      purpose: {
        required: true,
        minLength: 4,
        maxLength: 200,
        requiredMessage: "请输入借用目的",
        minLengthMessage: "借用目的至少需要4个字符"
      }
    },
    todo: {
      title: {
        required: true,
        minLength: 2,
        maxLength: 200,
        requiredMessage: "请输入待办标题",
        minLengthMessage: "待办标题至少需要2个字符"
      }
    }
  };

  function validateForm(form, rules) {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const input = form.elements[field];
      if (!input) continue;
      const value = String(input.value || "").trim();
      
      if (rule.required && !value) {
        errors.push({ field, message: rule.requiredMessage || `${field}不能为空` });
        continue;
      }
      
      if (value && rule.minLength && value.length < rule.minLength) {
        errors.push({ field, message: rule.minLengthMessage || `${field}至少需要${rule.minLength}个字符` });
      }
      
      if (value && rule.maxLength && value.length > rule.maxLength) {
        errors.push({ field, message: rule.maxLengthMessage || `${field}不能超过${rule.maxLength}个字符` });
      }
      
      if (value && rule.pattern && !rule.pattern.test(value)) {
        errors.push({ field, message: rule.patternMessage || `${field}格式不正确` });
      }
      
      if (rule.custom) {
        const customError = rule.custom(value, form);
        if (customError) {
          errors.push({ field, message: customError });
        }
      }
    }
    return errors;
  }

  function showFieldError(form, field, message) {
    const input = form.elements[field];
    if (!input) return;
    
    let errorEl = input.parentElement.querySelector(".field-error");
    if (!errorEl) {
      errorEl = document.createElement("small");
      errorEl.className = "field-error";
      errorEl.style.color = "var(--danger)";
      errorEl.style.fontSize = "12px";
      errorEl.style.marginTop = "4px";
      errorEl.style.display = "block";
      input.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
    input.style.borderColor = "var(--danger)";
  }

  function clearFieldErrors(form) {
    $$(".field-error", form).forEach((el) => el.remove());
    $$("input, select, textarea", form).forEach((input) => {
      input.style.borderColor = "";
    });
  }

  function validateDeviceAssetNo(assetNo, excludeId = null) {
    const existing = (state.deviceCatalog || []).find(
      (device) => device.assetNo === assetNo && device.id !== excludeId
    );
    return existing ? "设备编号已存在" : null;
  }

  function validateBorrowTime(borrowAt, expectedReturnAt) {
    if (!borrowAt || !expectedReturnAt) return null;
    const borrow = new Date(borrowAt);
    const returnDate = new Date(expectedReturnAt);
    if (returnDate <= borrow) {
      return "归还时间必须晚于借出时间";
    }
    return null;
  }

  function isOverdue(expectedReturnAt, returnStatus) {
    if (returnStatus === "returned") return false;
    const now = new Date();
    const expected = new Date(expectedReturnAt);
    return expected < now;
  }

  function getDeviceStats() {
    const devices = state.deviceCatalog || [];
    return {
      total: devices.length,
      available: devices.filter((d) => d.status === "available").length,
      borrowed: devices.filter((d) => d.status === "borrowed").length,
      maintenance: devices.filter((d) => d.status === "maintenance").length,
    };
  }

  function getBorrowStats() {
    const borrows = state.borrowCatalog || [];
    return {
      total: borrows.length,
      pending: borrows.filter((b) => b.status === "pending").length,
      approved: borrows.filter((b) => b.status === "approved" && b.returnStatus !== "returned").length,
      overdue: borrows.filter((b) => b.status === "approved" && isOverdue(b.expectedReturnAt, b.returnStatus)).length,
      returned: borrows.filter((b) => b.returnStatus === "returned").length,
    };
  }

  function bindEvents() {
    window.addEventListener(
      "resize",
      debounce(() => applyNavMode(state.profile.navMode || "auto"), 150, "nav-resize"),
    );

    els.loginForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(els.loginForm);
      login(String(form.get("username") || "").trim(), String(form.get("password") || ""));
    });

    els.logoutBtn?.addEventListener("click", () => logout());
    els.refreshBtn?.addEventListener("click", () => refreshAll());
    els.topnav?.addEventListener("click", (event) => {
      const button = event.target.closest(".nav-chip");
      if (!button) return;
      setActiveView(button.dataset.view);
    });

    // 事件委托：处理动态生成的 data-jump 元素（alert-chip, focus-link, stat li）
    document.addEventListener("click", (event) => {
      const jumpTarget = event.target.closest("[data-jump]");
      if (jumpTarget && jumpTarget.dataset.jump) {
        setActiveView(jumpTarget.dataset.jump);
        event.preventDefault();
      }
    });

    // 事件委托：处理动态生成的 data-shortcut 元素（shortcut-btn）
    document.addEventListener("click", (event) => {
      const shortcutBtn = event.target.closest("[data-shortcut]");
      if (shortcutBtn && shortcutBtn.dataset.shortcut) {
        triggerShortcut(shortcutBtn.dataset.shortcut);
        event.preventDefault();
      }
    });

    // 事件委托：处理复制按钮
    document.addEventListener("click", (event) => {
      const copyBtn = event.target.closest("[data-copy-text]");
      if (copyBtn && copyBtn.dataset.copyText) {
        const text = copyBtn.dataset.copyText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => {
              Toast.success("地址已复制到剪贴板");
              copyBtn.textContent = "✓";
              setTimeout(() => {
                copyBtn.textContent = "📋";
              }, 2000);
            })
            .catch(() => {
              Toast.error("复制失败，请手动复制");
            });
        } else {
          // 降级方案：使用 textarea
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand("copy");
            Toast.success("地址已复制到剪贴板");
            copyBtn.textContent = "✓";
            setTimeout(() => {
              copyBtn.textContent = "📋";
            }, 2000);
          } catch {
            Toast.error("复制失败，请手动复制");
          }
          document.body.removeChild(textarea);
        }
        event.preventDefault();
      }
    });

    els.userAvatarBtn?.addEventListener("click", () => {
      if (els.profilePopover?.hidden) openProfilePopover();
      else closeProfilePopover();
    });
    els.profileClose?.addEventListener("click", () => closeProfilePopover());
    document.addEventListener("click", (event) => {
      if (!els.profilePopover || els.profilePopover.hidden) return;
      if (els.profilePopover.contains(event.target) || els.userAvatarBtn?.contains(event.target)) return;
      closeProfilePopover();
    });

    els.profileForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(els.profileForm);
      state.profile.displayName = String(form.get("displayName") || "").trim();
      state.profile.signature = String(form.get("signature") || "").trim();
      state.profile.navMode = String(form.get("navMode") || "auto");
      saveStoredProfile();
      syncProfileUI();
      showFeedback("账户信息已保存。", "success", "overview");
    });

    els.mediaSort?.addEventListener("change", () => {
      state.mediaSort = els.mediaSort.value || "newest";
      renderMedia();
    });
    els.mediaSearch?.addEventListener(
      "input",
      debounce(() => {
        state.mediaSearch = els.mediaSearch.value.trim();
        renderMedia();
      }, DEBOUNCE_DELAY, "media-search")
    );
    els.mediaFilters?.addEventListener("click", (event) => {
      const button = event.target.closest(".filter-chip");
      if (!button) return;
      state.mediaFilter = button.dataset.filter || "all";
      $$("button", els.mediaFilters).forEach((node) => node.classList.toggle("is-active", node === button));
      renderMedia();
    });
    els.deviceSearch?.addEventListener(
      "input",
      debounce(async () => {
        state.deviceSearch = els.deviceSearch.value.trim();
        await refreshDevices();
      }, DEBOUNCE_DELAY, "device-search")
    );
    els.borrowSearch?.addEventListener(
      "input",
      debounce(async () => {
        state.borrowSearch = els.borrowSearch.value.trim();
        await refreshBorrowRequests();
      }, DEBOUNCE_DELAY, "borrow-search")
    );
    els.deviceFilters?.addEventListener("click", async (event) => {
      const button = event.target.closest(".filter-chip");
      if (!button) return;
      state.deviceFilter = button.dataset.filter || "all";
      $$("button", els.deviceFilters).forEach((node) => node.classList.toggle("is-active", node === button));
      await refreshDevices();
    });
    els.borrowFilters?.addEventListener("click", async (event) => {
      const button = event.target.closest(".filter-chip");
      if (!button) return;
      state.borrowFilter = button.dataset.filter || "all";
      $$("button", els.borrowFilters).forEach((node) => node.classList.toggle("is-active", node === button));
      await refreshBorrowRequests();
    });

    els.todoForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(els.todoForm);
      
      // 前端验证
      const errors = validateForm(els.todoForm, VALIDATION_RULES.todo || {});
      if (errors.length > 0) {
        errors.forEach(err => showFieldError(els.todoForm, err.field, err.message));
        showFeedback(errors[0].message, "error", "todo");
        return;
      }
      
      const form = new FormData(els.todoForm);
      try {
        setPending(true);
        await createTodo(form);
        showFeedback("待办已新增。", "success", "todo");
      } catch (error) {
        showFeedback(error.message || "新增待办失败", "error", "todo");
        reportClientError(error, "todo_create");
      } finally {
        setPending(false);
      }
    });

    els.todoList?.addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-todo-toggle]");
      if (!checkbox) return;
      try {
        setPending(true);
        await toggleTodo(checkbox.dataset.todoToggle, checkbox.checked);
      } catch (error) {
        showFeedback(error.message || "更新待办失败", "error", "todo");
        reportClientError(error, "todo_update");
      } finally {
        setPending(false);
      }
    });
    els.todoList?.addEventListener("click", async (event) => {
      const alertBtn = event.target.closest("[data-todo-alert]");
      if (alertBtn) {
        const overdueGroup = els.todoList.querySelector('[data-group="overdue"]');
        if (overdueGroup) overdueGroup.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const button = event.target.closest("[data-todo-delete]");
      if (!button) return;
      try {
        setPending(true);
        await deleteTodo(button.dataset.todoDelete);
        showFeedback("待办已删除。", "success", "todo");
      } catch (error) {
        showFeedback(error.message || "删除待办失败", "error", "todo");
        reportClientError(error, "todo_delete");
      } finally {
        setPending(false);
      }
    });

    els.settingsForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(els.settingsForm);
      const form = new FormData(els.settingsForm);
      try {
        setPending(true);
        await saveSettings(form);
        showFeedback("站点设置已保存。", "success", "settings");
      } catch (error) {
        showFeedback(error.message || "保存设置失败", "error", "settings");
        reportClientError(error, "settings_update");
      } finally {
        setPending(false);
      }
    });

    els.deviceForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(els.deviceForm);
      
      // 前端验证
      const errors = validateForm(els.deviceForm, VALIDATION_RULES.device);
      if (errors.length > 0) {
        errors.forEach(err => showFieldError(els.deviceForm, err.field, err.message));
        showFeedback(errors[0].message, "error", "device");
        return;
      }
      
      const assetNo = String(els.deviceForm.elements.assetNo?.value || "").trim();
      const assetNoError = validateDeviceAssetNo(assetNo, state.deviceEditingId);
      if (assetNoError) {
        showFieldError(els.deviceForm, "assetNo", assetNoError);
        showFeedback(assetNoError, "error", "device");
        return;
      }
      
      const form = new FormData(els.deviceForm);
      try {
        setPending(true);
        await saveDevice(form);
        showFeedback(state.deviceEditingId ? "设备已更新。" : "设备已保存。", "success", "device");
      } catch (error) {
        showFeedback(error.message || "保存设备失败", "error", "device");
        reportClientError(error, state.deviceEditingId ? "device_update" : "device_create");
      } finally {
        setPending(false);
      }
    });

    els.deviceFormCancel?.addEventListener("click", () => fillDeviceFormReset());

    els.deviceList?.addEventListener("click", async (event) => {
      const deleteButton = event.target.closest("[data-device-delete]");
      if (deleteButton) {
        try {
          setPending(true);
          await deleteDevice(deleteButton.dataset.deviceDelete);
          showFeedback("设备已删除。", "success", "device");
        } catch (error) {
          showFeedback(error.message || "删除设备失败", "error", "device");
          reportClientError(error, "device_delete");
        } finally {
          setPending(false);
        }
        return;
      }
      const button = event.target.closest("[data-device-edit]");
      if (!button) return;
      const device = (state.deviceCatalog || []).find((row) => row.id === button.dataset.deviceEdit);
      if (!device) return;
      openDeviceForm(device);
    });

    els.deviceRefreshBtn?.addEventListener("click", async () => {
      try {
        setPending(true);
        await refreshDevices({ scope: "catalog" });
      } catch (error) {
        showFeedback(error.message || "刷新设备失败", "error", "device");
        reportClientError(error, "device_refresh");
      } finally {
        setPending(false);
      }
    });
    els.borrowRefreshBtn?.addEventListener("click", async () => {
      try {
        setPending(true);
        await refreshBorrowRequests({ scope: "catalog" });
      } catch (error) {
        showFeedback(error.message || "刷新借出失败", "error", "borrow");
        reportClientError(error, "borrow_refresh");
      } finally {
        setPending(false);
      }
    });
    els.borrowForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(els.borrowForm);
      
      // 前端验证
      const errors = validateForm(els.borrowForm, VALIDATION_RULES.borrow);
      if (errors.length > 0) {
        errors.forEach(err => showFieldError(els.borrowForm, err.field, err.message));
        showFeedback(errors[0].message, "error", "borrow");
        return;
      }
      
      const borrowAt = String(els.borrowForm.elements.borrowAt?.value || "").trim();
      const expectedReturnAt = String(els.borrowForm.elements.expectedReturnAt?.value || "").trim();
      const timeError = validateBorrowTime(borrowAt, expectedReturnAt);
      if (timeError) {
        showFieldError(els.borrowForm, "expectedReturnAt", timeError);
        showFeedback(timeError, "error", "borrow");
        return;
      }
      
      const form = new FormData(els.borrowForm);
      try {
        setPending(true);
        await createBorrowRequest(form);
        showFeedback("借出申请已提交。", "success", "borrow");
      } catch (error) {
        showFeedback(error.message || "提交借出申请失败", "error", "borrow");
        reportClientError(error, "borrow_create");
      } finally {
        setPending(false);
      }
    });

    els.borrowList?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-borrow-action]");
      if (!button) return;
      try {
        setPending(true);
        const action = button.dataset.borrowAction;
        if (action === "approved") await updateBorrowRequest(button.dataset.id, { status: "approved" });
        if (action === "rejected") await updateBorrowRequest(button.dataset.id, { status: "rejected" });
        if (action === "returned") await updateBorrowRequest(button.dataset.id, { returnStatus: "returned" });
        showFeedback("借出申请已更新。", "success", "borrow");
      } catch (error) {
        showFeedback(error.message || "更新借出申请失败", "error", "borrow");
        reportClientError(error, "borrow_update");
      } finally {
        setPending(false);
      }
    });

    els.mediaGrid?.addEventListener("click", async (event) => {
      const checkbox = event.target.closest("[data-media-select]");
      if (checkbox) {
        toggleMediaSelection(checkbox.dataset.mediaSelect);
        renderMedia();
        return;
      }

      const batchButton = event.target.closest("[data-batch-action]");
      if (batchButton) {
        const action = batchButton.dataset.batchAction;
        if (action === "clear") {
          clearMediaSelection();
          renderMedia();
          return;
        }
        if (action === "approve" || action === "reject") {
          const status = action === "approve" ? "approved" : "rejected";
          const ids = Array.from(state.selectedMedia);
          if (ids.length === 0) return;
          try {
            setPending(true);
            await Promise.all(ids.map((id) => reviewMedia(id, status, getReviewNoteForItem(id))));
            clearMediaSelection();
            showFeedback(`已批量${action === "approve" ? "通过" : "退回"} ${ids.length} 个素材`, "success", "media");
          } catch (error) {
            showFeedback(error.message || "批量操作失败", "error", "media");
            reportClientError(error, "media_batch_review");
          } finally {
            setPending(false);
          }
        }
        return;
      }

      const button = event.target.closest("[data-media-review]");
      if (!button) return;
      try {
        setPending(true);
        await reviewMedia(button.dataset.id, button.dataset.mediaReview, getReviewNoteForItem(button.dataset.id));
        showFeedback("素材审核已更新。", "success", "media");
      } catch (error) {
        showFeedback(error.message || "素材审核失败", "error", "media");
        reportClientError(error, "media_review");
      } finally {
        setPending(false);
      }
    });

    els.reviewStack?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-media-review]");
      if (!button) return;
      try {
        setPending(true);
        await reviewMedia(button.dataset.id, button.dataset.mediaReview, getReviewNoteForItem(button.dataset.id));
        showFeedback("素材审核已更新。", "success", "review");
      } catch (error) {
        showFeedback(error.message || "素材审核失败", "error", "review");
        reportClientError(error, "media_review");
      } finally {
        setPending(false);
      }
    });

    els.uploadBtn?.addEventListener("click", async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/*,video/*";
      input.addEventListener("change", async () => {
        if (!input.files?.length) return;
        try {
          setPending(true);
          const formData = new FormData();
          Array.from(input.files).forEach((file) => formData.append("files", file));
          const csrfToken = readCookie("ss_csrf");
          const response = await fetch("/api/media/upload", {
            method: "POST",
            credentials: "same-origin",
            headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
            body: formData,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "上传失败");
          await loadBootstrap();
          showFeedback(`已上传 ${data.items?.length || 0} 个素材`, "success", "media");
        } catch (error) {
          showFeedback(error.message || "上传失败", "error", "media");
          reportClientError(error, "media_upload");
        } finally {
          setPending(false);
        }
      });
      input.click();
    });

    els.syncBtn?.addEventListener("click", async () => {
      try {
        setPending(true);
        await syncMedia();
      } catch (error) {
        showFeedback(error.message || "同步失败", "error", "media");
        reportClientError(error, "media_sync");
      } finally {
        setPending(false);
      }
    });

    // 团队协作事件绑定
    els.teamAddBtn?.addEventListener("click", () => {
      openTeamForm();
    });

    els.teamFormCancel?.addEventListener("click", () => {
      closeTeamForm();
    });

    els.teamForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(els.teamForm);
      const errors = validateForm(els.teamForm, VALIDATION_RULES.team || {});
      if (errors.length > 0) {
        errors.forEach((err) => showFieldError(els.teamForm, err.field, err.message));
        showFeedback(errors[0].message, "error", "team");
        return;
      }
      const form = new FormData(els.teamForm);
      const editingId = state.teamEditingId;
      
      try {
        setPending(true);
        if (editingId) {
          await updateTeamMember(editingId, form);
          showFeedback("团队成员已更新。", "success", "team");
        } else {
          await createTeamMember(form);
          showFeedback("团队成员已添加。", "success", "team");
        }
        closeTeamForm();
      } catch (error) {
        showFeedback(error.message || "保存团队成员失败", "error", "team");
        reportClientError(error, "team_save");
      } finally {
        setPending(false);
      }
    });

    els.teamGrid?.addEventListener("click", async (event) => {
      const moveUpButton = event.target.closest("[data-team-move-up]");
      if (moveUpButton) {
        try {
          setPending(true);
          await moveTeamMember(moveUpButton.dataset.teamMoveUp, "up");
        } catch (error) {
          showFeedback(error.message || "调整排序失败", "error", "team");
        } finally {
          setPending(false);
        }
        return;
      }

      const moveDownButton = event.target.closest("[data-team-move-down]");
      if (moveDownButton) {
        try {
          setPending(true);
          await moveTeamMember(moveDownButton.dataset.teamMoveDown, "down");
        } catch (error) {
          showFeedback(error.message || "调整排序失败", "error", "team");
        } finally {
          setPending(false);
        }
        return;
      }

      const editButton = event.target.closest("[data-team-edit]");
      if (editButton) {
        const member = (state.bootstrap?.team || []).find((m) => m.id === editButton.dataset.teamEdit);
        if (member) openTeamForm(member);
        return;
      }

      const deleteButton = event.target.closest("[data-team-delete]");
      if (deleteButton) {
        if (!confirm("确定要删除这位团队成员吗？")) return;
        try {
          setPending(true);
          await deleteTeamMember(deleteButton.dataset.teamDelete);
          showFeedback("团队成员已删除。", "success", "team");
        } catch (error) {
          showFeedback(error.message || "删除团队成员失败", "error", "team");
          reportClientError(error, "team_delete");
        } finally {
          setPending(false);
        }
      }
    });

    els.teamRefreshBtn?.addEventListener("click", async () => {
      try {
        setPending(true);
        await refreshTeam();
        showFeedback("团队数据已刷新。", "success", "team");
      } catch (error) {
        showFeedback(error.message || "刷新团队失败", "error", "team");
        reportClientError(error, "team_refresh");
      } finally {
        setPending(false);
      }
    });

    els.teamSearch?.addEventListener(
      "input",
      debounce(() => {
        state.teamSearch = els.teamSearch.value.trim();
        renderTeam();
      }, DEBOUNCE_DELAY, "team-search")
    );

    els.teamSort?.addEventListener("change", () => {
      state.teamSort = els.teamSort.value;
      renderTeam();
    });

    els.teamFilters?.addEventListener("click", (event) => {
      const button = event.target.closest(".filter-chip");
      if (!button) return;
      state.teamFilter = button.dataset.filter || "all";
      $$("button", els.teamFilters).forEach((node) => node.classList.toggle("is-active", node === button));
      renderTeam();
    });

    // 团队统计卡片点击筛选
    els.teamStats?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-filter]");
      if (!card) return;
      const filter = card.dataset.filter;
      state.teamFilter = filter;
      $$("button", els.teamFilters).forEach((node) => {
        node.classList.toggle("is-active", node.dataset.filter === filter);
      });
      renderTeam();
    });

    window.addEventListener("error", (event) => {
      const error = event.error || new Error(event.message || "Unknown error");
      reportClientError(error, "window_error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unhandled rejection"));
      reportClientError(reason, "unhandledrejection");
    });
  }

  function initLoginHint() {
    if (els.loginMessage) {
      els.loginMessage.textContent = `请使用管理员账号登录。当前时间：${nowText()}`;
    }
  }

  function initDefaultVisibility() {
    setShellLoggedIn(false);
    attachRevealObserver();
  }

  async function start() {
    loadStoredProfile();
    initDefaultVisibility();
    bindEvents();
    initLoginHint();
    await loadSession();
    if (!state.session?.authenticated) {
      setShellLoggedIn(false);
    } else {
      setShellLoggedIn(true);
      setActiveView("overview");
      renderAll();
    }
  }

  start().catch((error) => {
    console.error(error);
    reportClientError(error, "startup");
    setShellLoggedIn(false);
    if (els.loginMessage) els.loginMessage.textContent = error.message || "页面启动失败";
  });

  window.shengshengApp = {
    refreshAll,
    refreshDevices,
    refreshBorrowRequests,
    refreshKeyLists,
    loadBootstrap,
    createDevice,
    updateDevice,
    deleteDevice,
    createBorrowRequest,
    updateBorrowRequest,
    syncMedia,
  };
})();
