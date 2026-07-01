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
  mediaViewMode: 'list', // 'list' | 'grid'，默认列表流
  selectedMedia: new Set(),

  // 审片相关
  reviewFilter: 'all',
  reviewSearch: '',
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

  // 待办相关
  todoEditingId: null,

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
  // 清理各模块过滤/搜索/编辑状态，避免跨会话保留
  state.mediaFilter = 'all';
  state.mediaSearch = '';
  state.mediaSort = 'newest';
  state.reviewFilter = 'all';
  state.reviewSearch = '';
  state.reviewSort = 'newest';
  state.deviceFilter = 'all';
  state.deviceSearch = '';
  state.deviceEditingId = null;
  state.borrowFilter = 'all';
  state.borrowSearch = '';
  state.teamFilter = 'all';
  state.teamSearch = '';
  state.teamSort = 'name';
  state.teamEditingId = null;
  state.topicSearch = '';
  state.topicFilter = 'all';
  state.topicEditingId = null;
  state.todoEditingId = null;
  state.loginPending = false;
  state.actionPending = false;
  state.mediaViewMode = 'list';
  state.deviceCatalog = [];
  state.deviceItems = [];
  state.borrowCatalog = [];
  state.borrowItems = [];
  state.topicItems = [];
  state.teamCatalog = [];
  state.teamItems = [];
  state.profile = { displayName: '', signature: '', avatarUrl: '', navMode: 'auto' };
}

// 暴露到全局（调试用）
if (typeof window !== 'undefined') {
  window.__appState = state;
}
