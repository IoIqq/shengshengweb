# 📘 代码导航指南

> **目的**：让任何人（包括 AI 助手）在 30 秒内找到需要修改的代码位置。
> **维护**：每次新增/重构功能后同步更新本文件。

---

## 🗂️ 项目结构总览

```
shengsheng-ideology-studio-site/
├── index.html              # 页面结构（594 行）
├── app.js                  # 前端主逻辑（2328 行）
├── config.js               # 🆕 集中配置（API/UI/验证规则蓝图）
├── styles.css              # 全局样式（3310 行）
├── server/
│   ├── server.js           # 后端 API（2344 行）
│   ├── data/state.json     # 数据持久化
│   ├── uploads/            # 素材文件
│   └── logs/               # 运行日志
├── assets/ui/              # 静态资源
├── package.json            # 依赖与脚本
├── .env / .env.example     # 环境变量
├── ecosystem.config.js     # PM2 配置
├── README.md               # 用户使用说明
├── DEPLOYMENT_GUIDE.md     # 部署指南
├── OPTIMIZATION_SUMMARY.md # 历史优化记录
├── CODE_GUIDE.md           # 本文件：代码导航
└── ARCHITECTURE.md         # 系统架构说明
```

---

## 📋 config.js - 集中配置

**状态**：✅ 已接入 - 通过传统 `<script>` 加载，挂到 `window.shengshengConfig`  
**用途**：将 app.js 中分散的常量统一管理，为后续模块化重构做准备  
**用法**：`const { API, UI, VALIDATION_RULES } = window.shengshengConfig;`

### 配置分类

| 分类 | 导出常量 | 说明 |
|------|---------|------|
| API 端点 | `API.SESSION`, `API.MEDIA_REVIEW(id)` | 所有后端接口路径 |
| UI 常量 | `UI.FEEDBACK_TTL`, `UI.DEBOUNCE_DELAY` | 时长、延迟、存储键 |
| 视图标签 | `VIEW_LABELS.overview`, `VIEW_LABELS.media` | 导航栏中文名称 |
| 状态枚举 | `REVIEW_STATE`, `DEVICE_STATUS`, `BORROW_STATUS`, `ROLE` | 业务状态常量 |
| 状态标签 | `STATUS_LABELS.device.available` | 状态中文化映射 |
| 验证规则 | `VALIDATION_RULES.login.username` | 表单验证配置 |
| 排序器 | `SORTERS.newest`, `SORTERS.priority` | 高阶排序函数 |
| 概览配置 | `OVERVIEW_STATS`, `OVERVIEW_SHORTCUTS` | 首页卡片数据 |

### 使用方式

```html
<!-- 当前兼容（传统 script） -->
<script src="config.js"></script>
<script>
  const { API } = window.shengshengConfig;
  fetch(API.SESSION);
</script>
```

```javascript
// 未来 ES Module（需 Vite 构建）
import { API, VALIDATION_RULES } from './config.js';
```

### 迁移路径
1. **✅ 阶段 1（当前）**：config.js 通过传统 `<script>` 加载，挂到 `window.shengshengConfig`
2. **🟡 阶段 2（下一步）**：app.js 中逐步替换硬编码常量为 `window.shengshengConfig.XXX`
3. **🟢 阶段 3（未来）**：引入 Vite，改用 `<script type="module">` + `import`
4. **🟢 阶段 4（最终）**：删除 app.js 中的重复定义，config.js 成为唯一来源

---

## 🎯 30 秒快速定位

| 我想修改… | 文件 | 行号 | 函数/选择器 |
|---------|------|------|-----------|
| 登录逻辑 | app.js | 1416 | `login()` |
| 登出逻辑 | app.js | 1450 | `logout()` |
| 概览页渲染 | app.js | 790 | `renderDashboard()` |
| 日期徽章 | app.js | 805 | `#overview-date-badge` |
| 提醒 chip | app.js | 820 | `#overview-alerts` |
| 今日重点卡 | app.js | 870 | `#overview-focus` |
| 快捷操作按钮 | app.js | 950 | `#overview-shortcuts` |
| 最近动态时间线 | app.js | 980 | `#activity-list` |
| 素材列表 | app.js | 1011 | `renderMedia()` |
| 素材审核 | app.js | 1601 | `reviewMedia()` |
| 审片中心 | app.js | 1080 | `renderReview()` |
| 待办列表 | app.js | 1125 | `renderTodos()` |
| 设备管理 | app.js | 1159 | `renderDevices()` |
| 借出申请 | app.js | 1195 | `renderBorrowRequests()` |
| 团队协作 | app.js | 1246 | `renderTeam()` |
| 系统设置 | app.js | 1311 | `renderSettings()` |
| 视图切换 | app.js | 658 | `setActiveView()` |
| 表单验证规则 | app.js | 1688 | `VALIDATION_RULES` |
| 全局状态 | app.js | 126 | `state` |
| DOM 引用 | app.js | 195 | `els` |
| 事件绑定 | app.js | 1859 | `bindEvents()` |
| API 请求封装 | app.js | 598 | `request()` |
| Toast 通知 | app.js | 5 | `Toast` 对象 |
| 概览样式 | styles.css | ~2800 | `.overview-hero` |
| 数据库结构 | server/server.js | 200+ | `initDatabase()` |
| API 路由 | server/server.js | 1500+ | `app.post/get(...)` |

---

## 🧭 app.js 模块地图（按功能分组）

### 📦 模块 1：基础设施（L1-200）
- **L5-118** Toast 通知系统（show/remove/success/error/warning/info/escapeHtml）
- **L126-156** 全局状态 `state`（session, bootstrap, activeView, filters, profile）
- **L158-167** 排序器 `SORTERS`（newest/oldest/title/author/priority）
- **L195-263** DOM 引用集合 `els`（所有关键 DOM 元素的缓存）
- **L264-271** 模板引用 `templates`（media/todo/device/borrow/team 卡片）
- **L272-282** `VIEW_LABELS` 视图标签
- **L283-287** 全局常量（FEEDBACK_TTL, CLIENT_LOG_ENDPOINT, PROFILE_STORAGE_KEY, DEBOUNCE_DELAY）

### 🔧 模块 2：工具函数（L290-360）
- **L293-299** DOM 选择器 `$()` / `$$()`
- **L301-336** 时间格式化（nowText, formatDatetime）
- **L312-322** 角色辅助（getRoleLabel, getInitials）
- **L338-343** `debounce()` 防抖
- **L345-353** `escapeHtml()` HTML 转义
- **L354-358** `normalizeListResponse()` 统一列表响应

### 🌐 模块 3：API 与网络
- `readCookie(name)` 读取 cookie 值（用于取 CSRF token）
- `request(path, options)` 通用请求，自动注入 `X-CSRF-Token` 请求头
- `requestJSON(path, options)` JSON 请求封装

> 提示：行号会随代码演进失效，建议直接 grep 函数名定位。

### 📡 模块 4：数据同步（L360-484）
- **L360-374** 查询字符串构建（buildDeviceQuery, buildBorrowQuery）
- **L376-391** 数据源访问器（getDeviceSourceItems, getBorrowSourceItems, getAvailableBorrowDevices）
- **L388-423** 视图过滤（deviceMatchesView, borrowMatchesView）
- **L425-440** 视图同步（syncDeviceView, syncBorrowView）
- **L442-481** 异步刷新（refreshDevices, refreshBorrowRequests）
- **L482-484** `refreshKeyLists()` 批量刷新

### 💬 模块 5：UI 反馈（L486-557）
- **L486-515** 反馈提示（showFeedback, clearFeedback）
- **L516-543** Pending 状态（setPending）
- **L544-557** 登录状态（setLoginPending）

### 📋 模块 6：日志上报（L558-596）
- **L558-566** `captureClientContext()` 上下文采集
- **L568-585** `postClientLog()` 日志上报
- **L587-596** `reportClientError()` 错误上报

### 🏠 模块 7：界面外壳（L635-769）
- **L635-639** `setShellLoggedIn()` 登录态切换
- **L641-656** `updateNavIndicator()` 导航指示器
- **L658-696** `setActiveView()` 视图路由
- **L698-718** `triggerShortcut()` 快捷操作
- **L720-730** Profile Popover（open/close）
- **L732-769** `syncProfileUI()` 用户资料同步
- **L771-788** Profile 持久化（loadStoredProfile, saveStoredProfile）

### 📊 模块 8：渲染层（L790-1359）
- **L790-993** 🎯 `renderDashboard()` 概览页（核心）
  - L805-815 日期徽章
  - L820-840 提醒 chip
  - L870-940 今日重点卡片
  - L950-985 快捷操作按钮
  - L990-1010 最近动态时间线
- **L995-1009** 素材过滤（mediaMatchesFilter, matchesSearch）
- **L1011-1073** `renderMedia()` 素材网格
- **L1075-1078** `reviewItems()` 审片队列
- **L1080-1115** `renderReview()` 审片视图
- **L1116-1124** `getReviewStats()` 审片统计
- **L1125-1152** `renderTodos()` 待办列表
- **L1153-1158** `deviceStatusLabel()` 设备状态文本
- **L1159-1194** `renderDevices()` 设备列表
- **L1195-1245** `renderBorrowRequests()` 借出申请
- **L1246-1310** `renderTeam()` 团队卡片
- **L1311-1333** `renderSettings()` 系统设置
- **L1334-1342** `renderBorrowDeviceSelect()` 借出设备下拉
- **L1344-1359** `renderAll()` 渲染总入口

### 🔐 模块 9：会话与启动（L1361-1463）
- **L1361-1369** `loadBootstrap()` 初始化数据
- **L1370-1383** `refreshAll()` 全量刷新
- **L1385-1414** `loadSession()` 会话加载
- **L1416-1448** `login()` 登录
- **L1450-1463** `logout()` 登出

### ✏️ 模块 10：CRUD 操作（L1465-1618）
- **L1465-1479** 表单重置（getTemplate, fillTodoFormReset 等）
- **L1481-1506** 待办 CRUD（createTodo, toggleTodo, deleteTodo）
- **L1508-1530** `saveSettings()` 设置保存
- **L1531-1567** 设备 CRUD（createDevice, updateDevice, deleteDevice）
- **L1568-1599** 借出 CRUD（createBorrowRequest, updateBorrowRequest）
- **L1601-1610** `reviewMedia()` 素材审核
- **L1611-1618** `syncMedia()` 同步照片

### 👁️ 模块 11：性能与观察器（L1620-1686）
- **L1620-1636** `attachRevealObserver()` 滚动显示
- **L1638-1661** 懒加载图片（attachLazyImageObserver, observeLazyImages）
- **L1663-1670** `scheduleIdleTask()` 空闲任务
- **L1672-1686** `createDebouncer()` 防抖管理器

### ✅ 模块 12：表单验证（L1688-1829）
- **L1688-1754** `VALIDATION_RULES` 规则配置
- **L1755-1788** `validateForm()` 通用验证
- **L1789-1813** 字段错误（showFieldError, clearFieldErrors）
- **L1814-1829** 业务验证（validateDeviceAssetNo, validateBorrowTime）

### 📈 模块 13：业务统计（L1831-1857）
- **L1831-1837** `isOverdue()` 逾期判断
- **L1838-1846** `getDeviceStats()` 设备统计
- **L1848-1857** `getBorrowStats()` 借出统计

### 🎬 模块 14：事件绑定与启动（L1859-2310）
- **L1859-2280** `bindEvents()` 全部事件监听器
- **L2281-2290** 初始化（initLoginHint, initDefaultVisibility）
- **L2292-2310** `start()` 应用入口

---

## 🌐 server/server.js 模块地图

| 模块 | 大致行号 | 关键内容 |
|------|---------|---------|
| 依赖与配置 | L1-50 | dotenv, express, helmet, multer, sql.js |
| 路径解析 | L15-30 | resolvePath() 智能路径处理 |
| 数据库初始化 | L100-300 | initDatabase(), 表结构定义 |
| 中间件 | L300-500 | session, auth, rateLimit, multer |
| 工具函数 | L500-800 | logger, hash, uuid, file utils |
| 认证路由 | L800-1000 | /api/login, /api/logout, /api/session |
| 数据路由 | L1000-1500 | /api/bootstrap, /api/settings |
| 素材路由 | L1500-1800 | /api/media/* |
| 待办路由 | L1800-1900 | /api/todos/* |
| 设备路由 | L1900-2050 | /api/devices/* |
| 借出路由 | L2050-2200 | /api/borrow-requests/* |
| 团队路由 | L2200-2300 | /api/team/* |
| 启动逻辑 | L2300-2344 | app.listen() |

---

## 🎨 styles.css 模块地图

| 模块 | 行号范围 | 关键选择器 |
|------|---------|-----------|
| CSS 变量与字体 | L1-100 | `:root`, `--font-sans`, `--bg` |
| 重置与基础 | L100-300 | `*`, `body`, `html` |
| 通用按钮 | L300-500 | `.primary-btn`, `.ghost-btn`, `.filter-chip` |
| 表单组件 | L500-700 | `input`, `textarea`, `.field-error` |
| 登录页 | L700-1000 | `.auth-shell`, `.login-form` |
| 工作台外壳 | L1000-1300 | `.workspace-shell`, `.topnav`, `.nav-chip` |
| 视图面板 | L1300-1500 | `.workspace-panel` |
| 概览页 | L2800-3100 | `.overview-hero`, `.alert-chip`, `.focus-card` |
| 素材卡片 | L1500-1800 | `.media-card`, `.media-grid` |
| 审片项 | L1800-2000 | `.review-item`, `.review-stack` |
| 待办项 | L2000-2150 | `.todo-item`, `.todo-list` |
| 设备/借出 | L2150-2400 | `.device-item`, `.borrow-item` |
| 团队卡片 | L2400-2600 | `.team-card`, `.team-grid` |
| Toast | L2600-2800 | `.toast`, `.toast-container` |
| 响应式断点 | L3100-3310 | `@media (max-width: 768px)` |

---

## 🛠️ 常见修改场景速查

### 场景 1：在概览页添加新的统计卡片
1. 修改 `renderDashboard()` 中的 `items` 数组（app.js L850）
2. 后端 `/api/bootstrap` 返回对应字段（server.js dashboard 部分）
3. 添加跳转目标视图（如有需要，更新 `setActiveView` 支持）

### 场景 2：新增一个工作台页面
1. **HTML**：在 `index.html` 添加 `<section class="workspace-panel" data-panel="名称">`
2. **导航**：在 `<nav id="topnav">` 添加 `.nav-chip[data-view="名称"]`
3. **状态**：app.js `state.activeView` 默认值与 `VIEW_LABELS` 增加键
4. **渲染**：实现 `render名称()` 函数并加入 `renderAll()`
5. **样式**：styles.css 添加专属样式

### 场景 3：添加新的表单验证规则
1. 在 `VALIDATION_RULES`（app.js L1688）添加规则对象
2. 在表单 submit 处调用 `validateForm(form, VALIDATION_RULES.xxx)`
3. 必要时实现自定义验证（如 `validateDeviceAssetNo`）

### 场景 4：新增 API 端点
1. **后端**：在 server.js 对应路由区添加 `app.post('/api/xxx', ...)`
2. **前端**：在 app.js 添加 `requestJSON('/api/xxx', { method, body })`
3. **状态**：更新 `state.bootstrap` 或局部状态
4. **渲染**：调用对应 `render*()` 函数

### 场景 5：调整 UI 响应式行为
1. 找到对应组件的样式区块（参考 styles.css 模块地图）
2. 在 `@media (max-width: 768px)` 区块添加移动端规则
3. 必要时调整 `attachRevealObserver` 阈值

### 场景 6：修改通知逻辑
- Toast 通知 → `Toast.show()` (app.js L23)
- 面板反馈 → `showFeedback()` (app.js L486)

---

## 🔑 关键依赖关系

```
loadSession()
  └─ loadBootstrap()
      └─ renderAll()
          ├─ renderDashboard()    (概览)
          ├─ renderMedia()        (素材)
          ├─ renderReview()       (审片)
          ├─ renderTodos()        (待办)
          ├─ renderDevices()      (设备)
          ├─ renderBorrowRequests() (借出)
          ├─ renderTeam()         (团队)
          ├─ renderSettings()     (设置)
          └─ syncProfileUI()      (头像)

bindEvents()
  ├─ 登录表单 → login()
  ├─ 登出按钮 → logout()
  ├─ 刷新按钮 → refreshAll()
  ├─ 顶部导航 → setActiveView()
  ├─ data-jump → setActiveView() (事件委托)
  ├─ data-shortcut → triggerShortcut() (事件委托)
  └─ 各模块 CRUD 表单提交
```

---

## 📌 命名约定

| 前缀 | 含义 | 示例 |
|------|------|------|
| `render*` | 渲染 DOM | `renderDashboard()` |
| `refresh*` | 异步拉取数据 + 渲染 | `refreshDevices()` |
| `sync*` | 同步内存视图 | `syncDeviceView()` |
| `load*` | 初次加载数据 | `loadBootstrap()` |
| `create/update/delete*` | CRUD 操作 | `createTodo()` |
| `validate*` | 验证函数 | `validateForm()` |
| `is*` / `has*` | 布尔判断 | `isOverdue()` |
| `get*` | 取数函数 | `getDeviceStats()` |
| `set*` | 设值函数 | `setActiveView()` |

---

## 🏷️ 区块注释规范

代码中使用以下格式标注模块边界，便于搜索：

```javascript
// ═══════════════════════════════════════════════════════
// 📦 [模块名称]
// ─────────────────────────────────────────────────────
// 职责：xxx
// 依赖：state.xxx, els.xxx
// 调用方：xxx()
// ═══════════════════════════════════════════════════════
```

**使用 emoji 前缀**便于在 VS Code Outline / Ctrl+F 中快速定位。

---

## 🔗 相关文档

- **README.md** - 用户使用说明
- **ARCHITECTURE.md** - 系统架构与设计决策
- **DEPLOYMENT_GUIDE.md** - 生产部署指南
- **OPTIMIZATION_SUMMARY.md** - 历史优化记录

---

## 🧾 代码约定（重要）

### 事件处理：统一走事件委托
**所有动态生成卡片（媒体、设备、借用、团队、待办等）的交互，事件监听都绑在静态父容器上**（如 `els.mediaGrid`、`els.deviceList`），通过 `event.target.closest("[data-action]")` 路由到具体卡片。

✅ 正确：
```js
els.deviceList.addEventListener("click", (e) => {
  const card = e.target.closest(".device-card");
  if (!card) return;
  // ...
});
```

❌ 反模式（不要这样写）：
```js
function renderDevices() {
  els.deviceList.innerHTML = devices.map(d => `<div class="device-card">...</div>`).join("");
  els.deviceList.querySelectorAll(".device-card").forEach(card => {
    card.addEventListener("click", ...);  // 每次 render 都会累加监听器！
  });
}
```

**为什么**：本项目所有 `render*` 函数都用 `innerHTML =` 重写卡片，单卡片 addEventListener 在重渲染时不会被自动清除（即使 DOM 被替换，闭包持有的旧引用也会延迟回收）。统一委托到静态容器是最稳妥的做法。

所有 `addEventListener` 调用应集中在 `bindEvents()` 内一次性执行，由 `init()` 启动时调用一次。

---

**最后更新**：2026-05-29  
**维护原则**：每次新增模块/重构后立即同步，让本文件成为活的代码地图。
