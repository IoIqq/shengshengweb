/**
 * 配置和常量模块
 * 定义应用的所有配置项和常量
 */

// 排序器
export const SORTERS = {
  newest: (arr) => [...arr].sort((a, b) =>
    (b.uploadedAt || b.createdAt || '').localeCompare(a.uploadedAt || a.createdAt || '')
  ),
  oldest: (arr) => [...arr].sort((a, b) =>
    (a.uploadedAt || a.createdAt || '').localeCompare(b.uploadedAt || b.createdAt || '')
  ),
  title: (arr) => [...arr].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '')
  ),
  author: (arr) => [...arr].sort((a, b) =>
    (a.author || '').localeCompare(b.author || '')
  ),
  priority: (arr) => {
    const order = { high: 0, medium: 1, low: 2 };
    return [...arr].sort((a, b) =>
      (order[a.priority] || 1) - (order[b.priority] || 1)
    );
  },
};

// 视图标签
export const VIEW_LABELS = {
  overview: '首页',
  media: '素材库',
  review: '审片中心',
  todo: '待办事项',
  device: '设备登记',
  borrow: '借出申请',
  team: '团队协作',
  topics: '选题库',
  settings: '系统设置',
  'file-browser': '文件浏览',
  monitor: '资源监控',
  services: '服务管理',
  host: '主机控制',
};

// 验证规则
export const VALIDATION_RULES = {
  login: {
    username: {
      required: true,
      minLength: 2,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
      requiredMessage: '请输入用户名',
      patternMessage: '用户名只能包含字母、数字、下划线和中文'
    },
    password: {
      required: true,
      minLength: 6,
      maxLength: 100,
      requiredMessage: '请输入密码',
      minLengthMessage: '密码至少需要6个字符'
    }
  },
  device: {
    name: {
      required: true,
      minLength: 2,
      maxLength: 100,
      requiredMessage: '请输入设备名称',
      minLengthMessage: '设备名称至少需要2个字符'
    },
    category: {
      required: true,
      minLength: 2,
      maxLength: 50,
      requiredMessage: '请输入设备类别'
    },
    assetNo: {
      required: true,
      minLength: 3,
      maxLength: 50,
      pattern: /^[A-Z0-9-]+$/,
      requiredMessage: '请输入设备编号',
      patternMessage: '设备编号只能包含大写字母、数字和连字符'
    }
  },
  borrow: {
    applicant: {
      required: true,
      minLength: 2,
      maxLength: 50,
      requiredMessage: '请输入申请人姓名'
    },
    purpose: {
      required: true,
      minLength: 4,
      maxLength: 200,
      requiredMessage: '请输入借用目的',
      minLengthMessage: '借用目的至少需要4个字符'
    }
  },
  todo: {
    title: {
      required: true,
      minLength: 2,
      maxLength: 200,
      requiredMessage: '请输入待办标题',
      minLengthMessage: '待办标题至少需要2个字符'
    }
  }
};

// UI 常量
export const UI_CONSTANTS = {
  LOGIN_PLACEHOLDER: '请输入管理员账号和密码',
  FEEDBACK_TTL: 2400,
  DEBOUNCE_DELAY: 300,
  PROFILE_STORAGE_KEY: 'shengsheng.workspace.profile',
  LOGIN_REMEMBER_KEY: 'shengsheng.login.remember',
};

// API 端点
export const API_ENDPOINTS = {
  CLIENT_LOG: '/api/client-log',
  BOOTSTRAP: '/api/bootstrap',
  SESSION: '/api/session',
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',
};

// 排序函数
export function sortMedia(items, sortBy) {
  return (SORTERS[sortBy] || SORTERS.newest)(items);
}

export function sortReview(items, sortBy) {
  return (SORTERS[sortBy] || SORTERS.newest)(items);
}
