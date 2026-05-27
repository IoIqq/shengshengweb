# 🏗️ 系统架构文档

> **目的**：说明系统设计决策、技术选型、数据流向和扩展策略。
> **受众**：开发者、架构师、AI 助手。

---

## 📐 架构概览

### 技术栈

```
┌─────────────────────────────────────────┐
│          前端（单页应用）                 │
│  ┌─────────────────────────────────┐   │
│  │  HTML5 + CSS3 + Vanilla JS      │   │
│  │  • 无框架依赖                    │   │
│  │  • IIFE 模块化                   │   │
│  │  • 事件委托 + 观察器模式          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                  ↕ HTTP/JSON
┌─────────────────────────────────────────┐
│          后端（Node.js）                 │
│  ┌─────────────────────────────────┐   │
│  │  Express.js + SQLite             │   │
│  │  • RESTful API                   │   │
│  │  • Session 认证                  │   │
│  │  • Multer 文件上传               │   │
│  │  • Helmet 安全防护               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────┐
│          数据层                          │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ SQLite (WAL) │  │ 文件系统存储     │ │
│  │ • 用户/素材  │  │ • 图片/视频      │ │
│  │ • 待办/设备  │  │ • 缩略图         │ │
│  │ • 借出/团队  │  │ • 日志文件       │ │
│  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🎯 设计原则

### 1. 零依赖前端
**决策**：不使用 React/Vue/Angular  
**理由**：
- ✅ 减少构建复杂度
- ✅ 降低学习成本
- ✅ 提升加载速度（无框架开销）
- ✅ 便于快速部署

**权衡**：
- ⚠️ 手动 DOM 操作较繁琐
- ⚠️ 状态管理需自行实现
- ✅ 通过 IIFE + 模块化注释缓解

### 2. SQLite 单文件数据库
**决策**：使用 SQLite 而非 MySQL/PostgreSQL  
**理由**：
- ✅ 零配置部署
- ✅ 数据文件可直接备份
- ✅ 支持外部硬盘存储
- ✅ 适合中小规模数据（< 10万条）

**权衡**：
- ⚠️ 并发写入受限（WAL 模式缓解）
- ⚠️ 不适合高并发场景
- ✅ 目标场景（工作室内部）完全满足

### 3. Session 认证
**决策**：使用 Session + Cookie 而非 JWT  
**理由**：
- ✅ 服务端可主动撤销会话
- ✅ 无需客户端存储敏感令牌
- ✅ 实现简单

**权衡**：
- ⚠️ 不适合分布式部署
- ✅ 单机部署场景无影响

---

## 📊 数据流图

### 用户登录流程

```
┌──────┐   1. POST /api/login    ┌────────┐
│ 前端 │ ───────────────────────>│ 后端   │
│      │   { username, password } │        │
└──────┘                          └────────┘
   ↑                                   │
   │                                   │ 2. 验证密码
   │                                   ↓
   │                              ┌────────┐
   │                              │ SQLite │
   │                              │ users  │
   │                              └────────┘
   │                                   │
   │ 4. 返回 session                   │ 3. 生成 token
   │ <─────────────────────────────────┘
   │
   │ 5. 存储 state.session
   ↓
┌──────┐
│ 渲染 │
│ 工作台│
└──────┘
```

### 概览页渲染流程

```
┌──────┐   1. GET /api/bootstrap   ┌────────┐
│ 前端 │ ───────────────────────>│ 后端   │
└──────┘                          └────────┘
   ↑                                   │
   │                                   │ 2. 聚合数据
   │                                   ↓
   │                              ┌────────┐
   │                              │ SQLite │
   │                              │ • media│
   │                              │ • todos│
   │                              │ • devices
   │                              │ • borrows
   │                              └────────┘
   │                                   │
   │ 3. 返回 bootstrap 对象            │
   │ <─────────────────────────────────┘
   │
   │ 4. state.bootstrap = data
   ↓
┌──────────────────┐
│ renderDashboard()│
│ • 日期徽章        │
│ • 提醒 chip      │
│ • 今日重点        │
│ • 快捷操作        │
│ • 最近动态        │
└──────────────────┘
```

### 素材上传流程

```
┌──────┐   1. 选择文件           ┌────────┐
│ 用户 │ ───────────────────────>│ 前端   │
└──────┘                          └──────┘
                                     │
                                     │ 2. FormData
                                     ↓
                              POST /api/media/upload
                                     │
                                     ↓
                              ┌────────┐
                              │ Multer │ 3. 保存文件
                              └────────┘
                                     │
                                     ↓
                              ┌────────┐
                              │ SQLite │ 4. 插入元数据
                              │ media  │
                              └────────┘
                                     │
                                     │ 5. 返回 items[]
                                     ↓
                              ┌────────┐
                              │ 前端   │ 6. renderMedia()
                              └────────┘
```

---

## 🗄️ 数据库设计

### 核心表结构

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 素材表
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  title TEXT,
  source TEXT,
  author TEXT,
  kind TEXT,              -- 'image' | 'video'
  reviewState TEXT,       -- 'pending' | 'approved' | 'rejected'
  thumb TEXT,
  filePath TEXT,
  tags TEXT,              -- JSON array
  note TEXT,
  uploadedAt TEXT,
  reviewedAt TEXT,
  reviewedBy TEXT
);

-- 待办表
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  priority TEXT,          -- '高' | '中' | '低'
  done INTEGER DEFAULT 0,
  createdAt TEXT
);

-- 设备表
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  assetNo TEXT UNIQUE,
  status TEXT,            -- 'available' | 'borrowed' | 'maintenance'
  location TEXT,
  owner TEXT,
  note TEXT,
  createdAt TEXT
);

-- 借出申请表
CREATE TABLE borrow_requests (
  id TEXT PRIMARY KEY,
  applicant TEXT NOT NULL,
  deviceId TEXT,
  deviceName TEXT,
  purpose TEXT,
  borrowAt TEXT,
  expectedReturnAt TEXT,
  status TEXT,            -- 'pending' | 'approved' | 'rejected'
  returnStatus TEXT,      -- 'not_returned' | 'returned'
  approvedBy TEXT,
  approvedAt TEXT,
  note TEXT,
  createdAt TEXT
);

-- 团队表
CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  status TEXT,            -- 'active' | 'leave' | 'inactive'
  badge TEXT,
  email TEXT,
  phone TEXT,
  note TEXT,
  joinedAt TEXT,
  createdAt TEXT
);

-- 会话表
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 索引策略

```sql
-- 素材查询优化
CREATE INDEX idx_media_reviewState ON media(reviewState);
CREATE INDEX idx_media_uploadedAt ON media(uploadedAt DESC);

-- 借出查询优化
CREATE INDEX idx_borrow_status ON borrow_requests(status);
CREATE INDEX idx_borrow_device ON borrow_requests(deviceId);

-- 会话清理优化
CREATE INDEX idx_sessions_expires ON sessions(expiresAt);
```

---

## 🔐 安全架构

### 认证流程

```
1. 用户提交 { username, password }
2. 后端使用 scrypt 验证密码哈希
3. 生成随机 session token (crypto.randomBytes)
4. 存储到 sessions 表，设置 7 天过期
5. 返回 token 到前端（httpOnly cookie）
6. 后续请求携带 cookie 自动验证
```

### 防护措施

| 威胁 | 防护手段 | 实现位置 |
|------|---------|---------|
| XSS | CSP 策略 + HTML 转义 | Helmet + escapeHtml() |
| CSRF | SameSite Cookie | express-session |
| SQL 注入 | 参数化查询 | db.run(sql, params) |
| 暴力破解 | 登录速率限制 | express-rate-limit |
| 文件上传攻击 | 类型白名单 + 大小限制 | Multer filter |
| 点击劫持 | X-Frame-Options | Helmet |
| MIME 嗅探 | X-Content-Type-Options | Helmet |

---

## 🎨 前端架构

### 状态管理

```javascript
// 单一全局状态对象
const state = {
  session: null,           // 当前会话
  bootstrap: null,         // 初始化数据
  activeView: 'overview',  // 当前视图
  
  // 各模块局部状态
  mediaFilter: 'all',
  mediaSearch: '',
  selectedMedia: new Set(),
  deviceCatalog: [],
  borrowCatalog: [],
  profile: { ... },
  // ...
};
```

**设计理念**：
- 单向数据流：`state → render → DOM`
- 状态变更后手动调用 `render*()` 函数
- 无响应式系统（简化实现）

### 视图路由

```javascript
function setActiveView(view) {
  state.activeView = view;
  
  // 1. 更新导航高亮
  $$('.nav-chip').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === view);
  });
  
  // 2. 切换面板显示
  const prevPanel = document.querySelector('.workspace-panel.active');
  const nextPanel = document.querySelector(`[data-panel="${view}"]`);
  
  prevPanel?.classList.remove('active');
  nextPanel?.classList.add('active');
  
  // 3. 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'instant' });
}
```

**特点**：
- 纯 CSS 驱动动画（`.active` 类）
- 无需路由库
- 支持浏览器前进/后退（可扩展）

### 事件系统

```javascript
// 集中绑定 + 事件委托
function bindEvents() {
  // 1. 静态元素直接绑定
  els.loginForm?.addEventListener('submit', handleLogin);
  els.logoutBtn?.addEventListener('click', logout);
  
  // 2. 动态元素使用委托
  document.addEventListener('click', (e) => {
    const jumpBtn = e.target.closest('[data-jump]');
    if (jumpBtn) {
      setActiveView(jumpBtn.dataset.jump);
    }
    
    const shortcutBtn = e.target.closest('[data-shortcut]');
    if (shortcutBtn) {
      triggerShortcut(shortcutBtn.dataset.shortcut);
    }
  });
}
```

**优势**：
- 避免重复绑定
- 支持动态内容
- 性能优化

---

## 🚀 性能优化策略

### 1. 懒加载图片

```javascript
const lazyImageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      lazyImageObserver.unobserve(img);
    }
  });
}, { threshold: 0.01, rootMargin: '100px' });
```

### 2. 防抖搜索

```javascript
els.mediaSearch?.addEventListener('input', 
  debounce(() => {
    state.mediaSearch = els.mediaSearch.value.trim();
    renderMedia();
  }, 300)
);
```

### 3. 虚拟滚动（未实现，可扩展）

当素材数量 > 1000 时，可引入虚拟滚动：
- 只渲染可见区域 + 缓冲区
- 使用 `IntersectionObserver` 动态加载
- 参考库：`react-window`, `virtual-scroller`

### 4. SQLite 优化

```javascript
// WAL 模式（已启用）
db.exec('PRAGMA journal_mode = WAL;');

// 批量插入使用事务
db.exec('BEGIN TRANSACTION;');
items.forEach(item => db.run(insertSql, params));
db.exec('COMMIT;');
```

---

## 📦 模块化策略（未来）

### 当前状态
- ✅ 单文件 IIFE
- ✅ 区块注释分隔
- ⚠️ 无构建工具

### 渐进式重构路径

#### 阶段 1：提取配置（✅ 已完成 - 蓝图阶段）
```javascript
// config.js（已创建，未引用）
export const API = { SESSION, LOGIN, MEDIA_REVIEW: (id) => ..., ... };
export const UI = { FEEDBACK_TTL, DEBOUNCE_DELAY, TOAST_DURATION, ... };
export const VIEW_LABELS = { overview, media, review, ... };
export const REVIEW_STATE = { PENDING, APPROVED, REJECTED };
export const DEVICE_STATUS = { AVAILABLE, BORROWED, MAINTENANCE };
export const STATUS_LABELS = { device: {...}, borrow: {...}, ... };
export const VALIDATION_RULES = { login, device, borrow, todo };
export const SORTERS = { newest, oldest, title, author, priority };
export const OVERVIEW_STATS = [ ... ];
export const OVERVIEW_SHORTCUTS = [ ... ];

// 兼容传统 <script>：window.shengshengConfig
```
**说明**：config.js 已作为参考蓝图存在，待引入 Vite 后再替换 app.js 中的同名常量。

#### 阶段 2：拆分核心模块
```javascript
// core/state.js
export const state = { ... };

// core/api.js
export async function request(path, options) { ... }

// core/router.js
export function setActiveView(view) { ... }
```

#### 阶段 3：拆分业务模块
```javascript
// modules/auth.js
export async function login(username, password) { ... }

// modules/overview.js
export function renderDashboard() { ... }

// modules/media.js
export function renderMedia() { ... }
```

#### 阶段 4：引入构建工具
- **Vite**（推荐）：快速、零配置
- **Webpack**：成熟、插件丰富
- **Rollup**：适合库开发

---

## 🧪 测试策略（未来）

### 单元测试（Vitest）
```javascript
// tests/utils/format.test.js
import { formatDatetime } from '@/utils/format';

test('格式化有效日期', () => {
  expect(formatDatetime('2026-05-25T12:00:00'))
    .toMatch(/2026/);
});
```

### 集成测试（Vitest + happy-dom）
```javascript
// tests/modules/auth.test.js
import { login } from '@/modules/auth';

test('登录成功', async () => {
  const result = await login('admin', 'password');
  expect(result.authenticated).toBe(true);
});
```

### E2E 测试（Playwright）
```javascript
// e2e/login.spec.js
test('完整登录流程', async ({ page }) => {
  await page.goto('http://localhost:3001');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');
  await expect(page.locator('.workspace-shell')).toBeVisible();
});
```

---

## 🔄 扩展方向

### 1. 多用户权限系统
- 角色：admin / editor / viewer
- 权限矩阵：CRUD 操作级别控制
- 实现：中间件 + 前端路由守卫

### 2. 实时协作
- WebSocket 推送更新
- 乐观更新 + 冲突解决
- 库：Socket.IO / ws

### 3. 对象存储支持
- 阿里云 OSS / AWS S3
- 本地文件 → 云端迁移
- 渐进式：先支持双写，再切换

### 4. 移动端适配
- 响应式布局（已部分支持）
- PWA 离线缓存
- 触摸手势优化

---

## 📚 技术债务

| 项目 | 优先级 | 预计工时 |
|------|--------|---------|
| 模块化拆分 | 🟡 中 | 6h |
| 单元测试覆盖 | 🟢 低 | 8h |
| TypeScript 迁移 | 🟢 低 | 12h |
| 虚拟滚动 | 🟢 低 | 4h |
| WebSocket 实时 | 🟢 低 | 8h |

---

## 🎓 学习资源

- **Express.js**: https://expressjs.com/
- **SQLite**: https://www.sqlite.org/docs.html
- **Helmet**: https://helmetjs.github.io/
- **Multer**: https://github.com/expressjs/multer
- **Intersection Observer**: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

---

**最后更新**：2026-05-25  
**维护者**：开发团队  
**版本**：v2.0
