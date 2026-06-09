/**
 * 全局状态管理模块
 * 管理应用的所有状态数据
 */

export const state = {
  session: null,
  bootstrap: null,
  activeView: 'overview',
  loginPending: false,
  actionPending: false,

  // 素材相关
  mediaFilter: 'all',
  mediaSearch: '',
  mediaSort: 'newest',
  selectedMedia: new Set(),

  // 审片相关
  reviewFilter: 'all',
  reviewSort: 'newest',

  // 设备相关
  deviceFilter: 'all',
  deviceSearch: '',
  deviceCatalog: [],
  deviceItems: [],
  deviceEditingId: null,

  // 借出相关
  borrowFilter: 'all',
  borrowSearch: '',
  borrowCatalog: [],
  borrowItems: [],

  // 团队相关
  teamCatalog: [],
  teamItems: [],
  teamFilter: 'all',
  teamSearch: '',
  teamSort: 'name',
  teamEditingId: null,

  // 选题库相关
  topicItems: [],
  topicSearch: '',
  topicFilter: 'all',
  topicEditingId: null,

  // 存储管理
  storageStatus: null,
  storageValidation: null,

  // 用户资料
  profile: {
    displayName: '',
    signature: '',
    avatarUrl: '',
    navMode: 'auto',
  },
};

// 状态访问器
export function getState(key) {
  return key ? state[key] : state;
}

// 状态修改器
export function setState(key, value) {
  if (key in state) {
    state[key] = value;
  }
}

// 批量更新状态
export function updateState(updates) {
  Object.keys(updates).forEach(key => {
    if (key in state) {
      state[key] = updates[key];
    }
  });
}

// 重置状态
export function resetState() {
  state.session = null;
  state.bootstrap = null;
  state.activeView = 'overview';
  state.storageStatus = null;
  state.storageValidation = null;
  state.selectedMedia.clear();
}

// 暴露到全局（调试用）
if (typeof window !== 'undefined') {
  window.__appState = state;
}
