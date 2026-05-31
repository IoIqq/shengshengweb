/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 集中配置文件（Single Source of Truth）
 * ───────────────────────────────────────────────────────────────────────────────
 * 用途：将 app.js 中分散的常量、规则、端点统一管理
 * 状态：✅ 已接入 - 通过传统 <script> 加载，挂到 window.shengshengConfig
 * 用法：app.js 中 const { API, UI, VALIDATION_RULES } = window.shengshengConfig;
 *
 * 未来迁移到 ES Module：
 *   1. 解开 IIFE 包裹
 *   2. 把每个 const 改为 export const
 *   3. index.html 改用 <script type="module" src="app.js"></script>
 *   4. app.js 顶部 import { API, UI } from './config.js'
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  "use strict";

  // ─── API 端点 ─────────────────────────────────────────────────────────────────
  const API = {
    SESSION:        "/api/session",
    LOGIN:          "/api/login",
    LOGOUT:         "/api/logout",
    BOOTSTRAP:      "/api/bootstrap",
    SETTINGS:       "/api/settings",
    CLIENT_LOG:     "/api/client-log",
    BACKUP:         "/api/backup",
    MEDIA_UPLOAD:   "/api/media/upload",
    MEDIA_SYNC:     "/api/media/sync",
    MEDIA_REVIEW:   (id) => `/api/media/${encodeURIComponent(id)}/review`,
    WISHES:         "/api/wishes",
    WISH_BY_ID:     (id) => `/api/wishes/${encodeURIComponent(id)}`,
    TEAM_ORDER:     (id) => `/api/team/${encodeURIComponent(id)}/order`,
    TODOS:          "/api/todos",
    TODO_BY_ID:     (id) => `/api/todos/${encodeURIComponent(id)}`,
    DEVICES:        "/api/devices",
    DEVICE_BY_ID:   (id) => `/api/devices/${encodeURIComponent(id)}`,
    BORROW:         "/api/borrow-requests",
    BORROW_BY_ID:   (id) => `/api/borrow-requests/${encodeURIComponent(id)}`,
    PROFILE:          "/api/profile",
    PROFILE_PASSWORD: "/api/profile/password",
    PROFILE_AVATAR:   "/api/profile/avatar",
  };

  // ─── UI 常量 ──────────────────────────────────────────────────────────────────
  const UI = {
    FEEDBACK_TTL:         2400,
    DEBOUNCE_DELAY:       300,
    TOAST_DURATION:       4000,
    TOAST_ERROR_DURATION: 6000,
    TOAST_MAX_VISIBLE:    3,
    PROFILE_STORAGE_KEY:  "shengsheng.workspace.profile",
    LOGIN_REMEMBER_KEY:   "shengsheng.login.remember",
    LOGIN_PLACEHOLDER:    "请输入管理员账号和密码",
  };

  // ─── 视图标签 ─────────────────────────────────────────────────────────────────
  const VIEW_LABELS = {
    overview: "首页",
    media:    "素材库",
    review:   "审片中心",
    todo:     "待办事项",
    device:   "设备登记",
    borrow:   "借出申请",
    team:     "团队协作",
    settings: "系统设置",
  };

  // ─── 状态枚举 ─────────────────────────────────────────────────────────────────
  const REVIEW_STATE = {
    PENDING:  "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
  };

  const DEVICE_STATUS = {
    AVAILABLE:   "available",
    BORROWED:    "borrowed",
    MAINTENANCE: "maintenance",
  };

  const BORROW_STATUS = {
    PENDING:  "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
    RETURNED: "returned",
  };

  const ROLE = {
    ADMIN:  "admin",
    MEMBER: "member",
    GUEST:  "guest",
  };

  // ─── 状态标签映射（中文化） ──────────────────────────────────────────────────
  const STATUS_LABELS = {
    device: {
      available:   "可借",
      borrowed:    "已借出",
      maintenance: "维护中",
    },
    borrow: {
      pending:  "待审批",
      approved: "已通过",
      rejected: "已拒绝",
    },
    review: {
      pending:  "待审",
      approved: "已通过",
      rejected: "退回",
    },
    role: {
      admin:  "管理员",
      member: "成员",
      guest:  "访客",
    },
  };

  // ─── 表单验证规则 ────────────────────────────────────────────────────────────
  const VALIDATION_RULES = {
    login: {
      username: {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
        requiredMessage: "请输入用户名",
        patternMessage:  "用户名只能包含字母、数字、下划线和中文",
      },
      password: {
        required: true,
        minLength: 6,
        maxLength: 100,
        requiredMessage:  "请输入密码",
        minLengthMessage: "密码至少需要6个字符",
      },
    },
    device: {
      name: {
        required: true,
        minLength: 2,
        maxLength: 100,
        requiredMessage:  "请输入设备名称",
        minLengthMessage: "设备名称至少需要2个字符",
      },
      category: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入设备类别",
      },
      assetNo: {
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: /^[A-Z0-9-]+$/,
        requiredMessage: "请输入设备编号",
        patternMessage:  "设备编号只能包含大写字母、数字和连字符",
      },
    },
    borrow: {
      applicant: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入申请人姓名",
      },
      purpose: {
        required: true,
        minLength: 4,
        maxLength: 200,
        requiredMessage:  "请输入借用目的",
        minLengthMessage: "借用目的至少需要4个字符",
      },
    },
    team: {
      name: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入成员姓名",
      },
      role: {
        required: true,
        minLength: 2,
        maxLength: 50,
        requiredMessage: "请输入成员角色",
      },
    },
  };

  // ─── 排序器（高阶函数） ──────────────────────────────────────────────────────
  const SORTERS = {
    newest:   (arr) => [...arr].sort((a, b) => (b.uploadedAt || b.createdAt || "").localeCompare(a.uploadedAt || a.createdAt || "")),
    oldest:   (arr) => [...arr].sort((a, b) => (a.uploadedAt || a.createdAt || "").localeCompare(b.uploadedAt || b.createdAt || "")),
    title:    (arr) => [...arr].sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    author:   (arr) => [...arr].sort((a, b) => (a.author || "").localeCompare(b.author || "")),
    priority: (arr) => {
      const order = { high: 0, medium: 1, low: 2 };
      return [...arr].sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
    },
  };

  // ─── 概览卡片配置 ────────────────────────────────────────────────────────────
  const OVERVIEW_STATS = [
    { label: "素材总数", key: "all",        jump: "media",  tone: "neutral" },
    { label: "待审",     key: "pending",    jump: "review", tone: "warning" },
    { label: "已通过",   key: "approved",   jump: "media",  tone: "success" },
    { label: "待办",     key: "todoOpen",   jump: "todo",   tone: "info" },
    { label: "设备",     key: "devices",    jump: "device", tone: "neutral" },
    { label: "借出",     key: "borrowOpen", jump: "borrow", tone: "primary" },
  ];

  const OVERVIEW_SHORTCUTS = [
    { icon: "📤", label: "上传素材", action: "upload" },
    { icon: "✓",  label: "进入审片", action: "jump-review" },
    { icon: "📋", label: "添加待办", action: "jump-todo" },
    { icon: "📦", label: "登记设备", action: "jump-device" },
    { icon: "🔄", label: "同步照片", action: "sync" },
    { icon: "⬇",  label: "下载备份", action: "backup" },
  ];

  // ─── 聚合导出 ────────────────────────────────────────────────────────────────
  const config = {
    API,
    UI,
    VIEW_LABELS,
    REVIEW_STATE,
    DEVICE_STATUS,
    BORROW_STATUS,
    ROLE,
    STATUS_LABELS,
    VALIDATION_RULES,
    SORTERS,
    OVERVIEW_STATS,
    OVERVIEW_SHORTCUTS,
    VERSION: "2.0.1",
  };

  // 挂到全局，供 app.js 通过 window.shengshengConfig 访问
  global.shengshengConfig = config;

  // 兼容 CommonJS 环境（如 Vitest/Jest 测试）
  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }
})(typeof window !== "undefined" ? window : globalThis);
