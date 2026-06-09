/**
 * DOM 引用缓存模块
 * 缓存所有常用的 DOM 元素引用，避免重复查询
 */

// 缓存清理钩子：由 createDOMProxy 注册，clearDOMCache() 调用
let resetCache = () => {};

// 创建一个代理对象，延迟查询 DOM 元素
function createDOMProxy() {
  let cache = {};
  // 注册重置入口，供 clearDOMCache() 在动态挂载面板后失效旧的 null 缓存
  resetCache = () => {
    cache = {};
  };
  const elementIds = {
    // 认证相关
    authShell: 'auth-shell',
    workspaceShell: 'workspace-shell',
    loginForm: 'login-form',
    loginMessage: 'login-message',
    loginUsername: 'login-username',
    loginPassword: 'login-password',
    loginPasswordToggle: 'login-password-toggle',
    loginGuest: 'login-guest',
    capsLockHint: 'caps-lock-hint',
    loginRemember: 'login-remember',
    registrationToggle: 'registration-toggle',
    registrationForm: 'registration-form',
    registrationSubmit: 'registration-submit',
    // 顶部导航
    logoutBtn: 'logout-btn',
    refreshBtn: 'refresh-btn',
    topnav: 'topnav',
    navIndicator: 'nav-indicator',
    siteTitle: 'site-title',
    // 首页
    homeHeroMessage: 'home-hero-message',
    rolePill: 'role-pill',
    roleTitle: 'role-title',
    roleDescription: 'role-description',
    dashboardStats: 'dashboard-stats',
    overviewGrid: 'overview-grid',
    activityList: 'activity-list',
    // 素材库
    mediaGrid: 'media-grid',
    mediaSearch: 'media-search',
    mediaSort: 'media-sort',
    mediaFilters: 'media-filters',
    // 审片中心
    reviewStack: 'review-stack',
    reviewCount: 'review-count',
    reviewSearch: 'review-search',
    reviewFilters: 'review-filters',
    reviewSort: 'review-sort',
    // 待办事项
    todoForm: 'todo-form',
    todoList: 'todo-list',
    todoOpenCount: 'todo-open-count',
    todoAssigneeSelect: 'todo-assignee-select',
    // 设备登记
    deviceForm: 'device-form',
    deviceFormId: 'device-form-id',
    deviceFormSubmit: 'device-form-submit',
    deviceFormCancel: 'device-form-cancel',
    deviceList: 'device-list',
    deviceCount: 'device-count',
    deviceRefreshBtn: 'device-refresh-btn',
    deviceFilters: 'device-filters',
    deviceSearch: 'device-search',
    deviceImagePreview: 'device-image-preview',
    deviceImageBtn: 'device-image-upload-btn',
    deviceImageFile: 'device-image-file',
    deviceImageUrl: 'device-image-url',
    deviceImageClear: 'device-image-clear',
    deviceCatList: 'device-cat-list',
    deviceLocList: 'device-loc-list',
    deviceOwnerList: 'device-owner-list',
    // 借出申请
    borrowForm: 'borrow-form',
    borrowList: 'borrow-list',
    borrowCount: 'borrow-count',
    borrowRefreshBtn: 'borrow-refresh-btn',
    borrowFilters: 'borrow-filters',
    borrowSearch: 'borrow-search',
    borrowDeviceSelect: 'borrow-device-select',
    // 团队协作
    teamGrid: 'team-grid',
    teamCount: 'team-count',
    teamRefreshBtn: 'team-refresh-btn',
    teamAddBtn: 'team-add-btn',
    teamStats: 'team-stats',
    teamForm: 'team-form',
    teamFormId: 'team-form-id',
    teamFormSubmit: 'team-form-submit',
    teamFormCancel: 'team-form-cancel',
    teamSearch: 'team-search',
    teamSort: 'team-sort',
    teamFilters: 'team-filters',
    // 系统设置
    settingsNav: 'settings-nav',
    settingsPanel: 'settings-panel',
    settingsForm: 'settings-form',
    systemCard: 'system-card',
    storageContent: 'storage-content',
    storageStatusCard: 'storage-status-card',
    storageVolumeList: 'storage-volume-list',
    storageForm: 'storage-form',
    storageValidationResult: 'storage-validation-result',
    storageLanList: 'storage-lan-list',
    // 工具栏
    uploadBtn: 'upload-btn',
    syncBtn: 'sync-btn',
    // 用户资料
    userAvatarBtn: 'user-avatar-btn',
    userAvatarInitials: 'user-avatar-initials',
    avatarTooltip: 'avatar-tooltip',
    profilePopover: 'profile-popover',
    profileClose: 'profile-close',
    profileForm: 'profile-form',
    profileDisplayName: 'profile-display-name',
    profileSignature: 'profile-signature',
    profileNavMode: 'profile-nav-mode',
    profileAccountName: 'profile-account-name',
    profileAccountRole: 'profile-account-role',
    profileAvatarPreview: 'profile-avatar-preview',
    profilePreviewName: 'profile-preview-name',
    profilePreviewSignature: 'profile-preview-signature',
    userAvatarImage: 'user-avatar-image',
    profileAvatarImage: 'profile-avatar-image',
    profileAvatarInput: 'profile-avatar-input',
    profileSaveBtn: 'profile-save-btn',
    profilePwdOld: 'profile-pwd-old',
    profilePwdNew: 'profile-pwd-new',
    profilePwdConfirm: 'profile-pwd-confirm',
    profilePwdHint: 'profile-pwd-hint',
    profilePwdBtn: 'profile-pwd-btn',
    profileFeedback: 'profile-feedback',
    profileSummary: 'profile-summary',
    profileSummaryTodos: 'profile-summary-todos',
    profileSummaryBorrow: 'profile-summary-borrow',
    profileSummaryActive: 'profile-summary-active',
    profileStatusDot: 'profile-status-dot',
    profileRoleBadge: 'profile-role-badge',
    teamLeaderboard: 'team-leaderboard',
    teamBanner: 'team-banner',
    // 选题库
    topicsForm: 'topics-form',
    topicsList: 'topics-list',
    topicsBadge: 'topics-badge',
    topicsSearch: 'topics-search',
    topicsFilters: 'topics-filters',
    topicsStatusFilter: 'topics-status-filter',
    topicsSubmitBtn: 'topics-submit-btn',
  };

  // 特殊查询选择器
  const specialSelectors = {
    loginSubmit: "#login-form button[type='submit']",
    settingsSubmitBtn: "#settings-form button[type='submit']",
  };

  return new Proxy({}, {
    get(target, prop) {
      // 如果已缓存，直接返回
      if (cache[prop] !== undefined) {
        return cache[prop];
      }

      // 查询元素
      let element = null;
      if (specialSelectors[prop]) {
        element = document.querySelector(specialSelectors[prop]);
      } else if (elementIds[prop]) {
        element = document.getElementById(elementIds[prop]);
      }

      // 缓存结果（包括 null）
      cache[prop] = element;
      return element;
    },
    set(target, prop, value) {
      // 允许手动设置缓存
      cache[prop] = value;
      return true;
    }
  });
}

export const els = createDOMProxy();

/**
 * 初始化 DOM 引用
 * 清除缓存，强制重新查询所有元素
 */
export function initDOMRefs() {
  // 清除所有缓存，下次访问时会重新查询
  console.log('🔄 重新初始化 DOM 引用');
  // Proxy 会自动处理重新查询
}

/**
 * 清除 DOM 缓存
 * 用于动态内容更新后强制重新查询（例如异步挂载工作台面板模板之后，
 * 需要让之前缓存的 null 失效，使 els 重新命中新挂载的节点）。
 */
export function clearDOMCache() {
  console.log('🗑️ 清除 DOM 缓存');
  resetCache();
}

/**
 * 获取指定的 DOM 元素
 * @param {string} key - 元素键名
 * @returns {HTMLElement|null}
 */
export function getElement(key) {
  return els[key] || null;
}

/**
 * 检查元素是否存在
 * @param {string} key - 元素键名
 * @returns {boolean}
 */
export function hasElement(key) {
  return !!els[key];
}
