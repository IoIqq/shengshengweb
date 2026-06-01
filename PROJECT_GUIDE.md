# 📖 项目架构指南

本文档介绍项目的代码结构、模块说明和开发规范。

## 📑 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [前端架构](#前端架构)
- [后端架构](#后端架构)
- [数据库设计](#数据库设计)
- [API 说明](#api-说明)
- [开发规范](#开发规范)

---

## 📌 项目概述

**声声网络思政工作室网站** 是一个面向工作室日常协作的轻量级管理系统。

### 核心功能
- 🖼️ **素材库**：图片和视频管理、审核
- ✅ **审片中心**：素材审核、备注
- 📋 **待办事项**：任务管理、优先级
- 👥 **团队协作**：成员管理、状态跟踪
- 🔧 **设备管理**：设备库存、借出记录
- ⚙️ **系统设置**：网站配置、用户管理
- 💬 **留言墙**：互动留言

### 项目特点
- ✅ 模块化架构
- ✅ 响应式设计
- ✅ 离线友好
- ✅ 易于部署
- ✅ 易于迁移

---

## 🛠️ 技术栈

### 前端
- **HTML5/CSS3** - 基础结构和样式
- **JavaScript (ES6+)** - 模块化原生 JS
- **无框架** - 轻量级实现

### 后端
- **Node.js** (>= 18.0.0) - 运行环境
- **Express** - Web 框架
- **SQLite** (sql.js) - 数据库
- **Multer** - 文件上传
- **Helmet** - 安全防护

### 工具链
- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **PM2** - 进程管理
- **nodemon** - 开发热更新

---

## 📁 目录结构

```
shengsheng-ideology-studio-site/
├── 📄 index.html              # 主页面
├── 📄 styles.css              # 主样式
├── 📄 config.js               # 前端配置
├── 📄 favicon.svg             # 网站图标
│
├── 📁 js/                     # 前端模块化代码
│   ├── app-modular.js         # 应用主入口
│   ├── core/                  # 核心模块
│   │   ├── config.js          # 配置常量
│   │   ├── dom.js             # DOM 元素管理
│   │   └── state.js           # 状态管理
│   ├── ui/                    # UI 组件
│   │   ├── feedback.js        # 用户反馈
│   │   ├── loading.js         # 加载动画
│   │   ├── navigation.js      # 导航控制
│   │   └── toast.js           # 提示消息
│   ├── modules/               # 业务模块
│   │   ├── borrow.js          # 借出管理
│   │   ├── dashboard.js       # 概览面板
│   │   ├── device.js          # 设备管理
│   │   ├── media.js           # 素材管理
│   │   ├── settings.js        # 系统设置
│   │   ├── team.js            # 团队管理
│   │   └── todo.js            # 待办事项
│   ├── utils/                 # 工具函数
│   │   ├── api.js             # API 请求
│   │   └── helpers.js         # 辅助函数
│   └── services/              # 服务层
│
├── 📁 server/                 # 后端代码
│   ├── server.js              # 服务器主文件
│   ├── config/                # 配置
│   ├── database/              # 数据库
│   ├── middleware/            # 中间件
│   ├── routes/                # 路由
│   ├── services/              # 业务服务
│   ├── utils/                 # 工具
│   ├── scripts/               # 脚本
│   │   ├── init-db.js         # 数据库初始化
│   │   ├── check-env.js       # 环境检查
│   │   └── maintenance.js     # 维护脚本
│   ├── data/                  # 数据存储
│   │   └── studio.sqlite      # SQLite 数据库
│   └── uploads/               # 上传文件
│       ├── media/             # 素材文件
│       └── inbox/             # 待处理文件
│
├── 📁 assets/                 # 静态资源
│   └── ui/                    # UI 资源
│
├── 📄 wish-wall.js            # 留言墙
├── 📄 mobile-nav.js           # 移动导航
│
├── 📄 package.json            # 项目配置
├── 📄 .env.example            # 环境变量模板
├── 📄 ecosystem.config.js     # PM2 配置
│
├── 📄 setup.bat               # Windows 部署脚本
├── 📄 setup.sh                # Linux/Mac 部署脚本
│
├── 📄 .eslintrc.json          # ESLint 配置
├── 📄 eslint.config.js        # ESLint 新版配置
├── 📄 .prettierrc             # Prettier 配置
├── 📄 .editorconfig           # 编辑器配置
│
├── 📚 README.md               # 项目说明
├── 📚 DEPLOYMENT.md           # 部署指南
├── 📚 MAINTENANCE.md          # 维护手册
├── 📚 PROJECT_GUIDE.md        # 项目指南（本文档）
└── 📚 CHANGELOG.md            # 更新日志
```

---

## 🎨 前端架构

### 模块化设计

前端采用模块化设计，每个模块职责单一、易于维护。

#### 入口文件
**`js/app-modular.js`** - 应用主入口
- 导入所有模块
- 初始化应用
- 绑定全局事件
- 处理登录流程

#### 核心层（core/）
- **`state.js`** - 全局状态管理
- **`dom.js`** - DOM 元素的延迟加载（Proxy）
- **`config.js`** - 应用配置常量

#### UI 层（ui/）
- **`navigation.js`** - 页面切换、视图管理
- **`feedback.js`** - 弹窗、Toast、确认框
- **`loading.js`** - 加载动画、骨架屏
- **`toast.js`** - 消息提示系统

#### 业务层（modules/）
每个模块对应一个功能模块，结构一致：
```javascript
// 渲染函数
export function renderModule() { }

// CRUD 操作
export async function createItem() { }
export async function updateItem() { }
export async function deleteItem() { }
```

#### 工具层（utils/）
- **`api.js`** - 统一的 API 请求处理
- **`helpers.js`** - 通用辅助函数

### 状态管理

```javascript
// js/core/state.js
export const state = {
  session: null,        // 当前用户会话
  bootstrap: null,      // 应用数据
  activeView: 'overview', // 当前视图
  // ... 各模块的状态
};
```

### 数据流

```
用户操作
  ↓
事件处理
  ↓
API 请求 (utils/api.js)
  ↓
更新状态 (core/state.js)
  ↓
渲染 UI (modules/*)
  ↓
用户反馈 (ui/feedback.js)
```

---

## ⚙️ 后端架构

### 入口文件
**`server/server.js`** - Express 应用主文件

### 主要模块

#### 配置（config/）
- 环境变量加载
- 应用配置

#### 数据库（database/）
- SQLite 初始化
- 数据库操作封装
- 持久化处理

#### 中间件（middleware/）
- 身份验证
- 请求限流
- 错误处理

#### 路由（routes/）
按功能模块组织 API 路由：
- 媒体路由
- 待办路由
- 团队路由
- 设备路由
- 借出路由
- 设置路由

#### 服务（services/）
业务逻辑处理：
- 媒体处理
- 文件管理
- 数据验证

#### 工具（utils/）
- 加密工具
- 日志工具
- 验证工具
- 辅助函数

### 请求流程

```
HTTP 请求
  ↓
中间件（认证、限流）
  ↓
路由匹配
  ↓
业务服务
  ↓
数据库操作
  ↓
返回响应
```

---

## 💾 数据库设计

### 数据表结构

#### media（素材表）
```sql
- id INTEGER PRIMARY KEY
- filename TEXT
- originalName TEXT
- kind TEXT (image/video)
- reviewState TEXT (pending/approved/rejected)
- note TEXT
- tags TEXT
- uploadedAt INTEGER
- reviewedAt INTEGER
```

#### todos（待办表）
```sql
- id INTEGER PRIMARY KEY
- title TEXT
- description TEXT
- priority TEXT
- dueDate TEXT
- assignee TEXT
- done INTEGER (0/1)
- createdAt INTEGER
```

#### team（团队表）
```sql
- id INTEGER PRIMARY KEY
- name TEXT
- role TEXT
- avatar TEXT
- bio TEXT
- email TEXT
- phone TEXT
- status TEXT
- joinedAt INTEGER
```

#### devices（设备表）
```sql
- id INTEGER PRIMARY KEY
- name TEXT
- category TEXT
- model TEXT
- serialNumber TEXT
- status TEXT
- location TEXT
- purchaseDate TEXT
- note TEXT
```

#### borrow_requests（借出记录）
```sql
- id INTEGER PRIMARY KEY
- deviceId INTEGER
- borrower TEXT
- purpose TEXT
- borrowDate TEXT
- expectedReturnDate TEXT
- actualReturnDate TEXT
- status TEXT
```

#### wishes（留言墙）
```sql
- id INTEGER PRIMARY KEY
- author TEXT
- content TEXT
- mood TEXT
- isAnonymous INTEGER
- createdAt INTEGER
```

---

## 🌐 API 说明

### 认证 API
- `POST /api/login` - 登录
- `POST /api/logout` - 登出
- `GET /api/session` - 获取会话

### 数据 API
- `GET /api/bootstrap` - 获取初始数据
- `GET /api/backup` - 数据备份

### 素材 API
- `POST /api/media/upload` - 上传素材
- `POST /api/media/:id/review` - 审核素材
- `DELETE /api/media/:id` - 删除素材
- `POST /api/media/sync` - 同步服务器素材

### 待办 API
- `POST /api/todos` - 创建待办
- `PATCH /api/todos/:id` - 更新待办
- `DELETE /api/todos/:id` - 删除待办

### 设备 API
- `POST /api/devices` - 创建设备
- `PATCH /api/devices/:id` - 更新设备
- `DELETE /api/devices/:id` - 删除设备

### 借出 API
- `POST /api/borrow-requests` - 创建借出
- `POST /api/borrow-requests/:id/approve` - 审批
- `POST /api/borrow-requests/:id/return` - 归还

### 团队 API
- `POST /api/team` - 添加成员
- `PATCH /api/team/:id` - 更新成员
- `DELETE /api/team/:id` - 删除成员

### 设置 API
- `GET /api/settings` - 获取设置
- `PATCH /api/settings` - 更新设置

### 个人资料 API
- `PATCH /api/profile` - 更新资料
- `POST /api/profile/avatar` - 上传头像
- `POST /api/profile/password` - 修改密码

---

## 📝 开发规范

### 代码风格

#### JavaScript
- 使用 **2 空格** 缩进
- 使用**单引号**
- 行尾添加**分号**
- 使用 `const`/`let`，不使用 `var`
- 优先使用箭头函数
- 使用 `===` 而非 `==`

#### 命名规范
- **变量/函数**：camelCase（`userName`）
- **常量**：UPPER_SNAKE_CASE（`MAX_SIZE`）
- **类**：PascalCase（`UserManager`）
- **文件**：kebab-case（`user-manager.js`）

### 注释规范

```javascript
/**
 * 函数说明
 * @param {string} name - 参数说明
 * @returns {boolean} 返回值说明
 */
function example(name) {
  // 单行注释说明
  return true;
}
```

### Git 提交规范

```bash
# 格式
<类型>: <描述>

# 类型
feat:     新功能
fix:      修复 bug
docs:     文档更新
style:    格式调整
refactor: 重构
perf:     性能优化
test:     测试
chore:    构建/工具

# 示例
feat: 添加素材批量删除功能
fix: 修复登录密码显示按钮
docs: 更新部署文档
```

### 模块开发流程

#### 1. 创建模块文件
```javascript
// js/modules/example.js

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { request } from '../utils/api.js';

// 渲染函数
export function renderExample() {
  // 渲染逻辑
}

// CRUD 函数
export async function createExample(data) {
  // 创建逻辑
}
```

#### 2. 在主入口注册
```javascript
// js/app-modular.js
import { renderExample, createExample } from './modules/example.js';
```

#### 3. 添加路由（后端）
```javascript
// server/routes/example.js
router.get('/api/examples', async (req, res) => {
  // 处理逻辑
});
```

#### 4. 测试
- 功能测试
- 错误处理
- 边界情况
- 性能测试

### 错误处理

```javascript
// 前端
try {
  await request('/api/example');
} catch (error) {
  Toast.error(error.message);
}

// 后端
app.get('/api/example', async (req, res) => {
  try {
    // 业务逻辑
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 性能优化

1. **使用骨架屏** - 提升感知性能
2. **图片懒加载** - 减少初始加载
3. **数据缓存** - 减少 API 请求
4. **防抖/节流** - 优化高频事件
5. **代码分割** - 按需加载

---

## 🎯 最佳实践

### 前端
- ✅ 使用模块化组织代码
- ✅ 状态集中管理
- ✅ 错误统一处理
- ✅ 用户反馈友好
- ✅ 响应式设计

### 后端
- ✅ 路由按模块组织
- ✅ 业务逻辑分层
- ✅ 输入严格验证
- ✅ 错误规范处理
- ✅ 安全防护到位

### 通用
- ✅ 代码注释清晰
- ✅ 命名规范统一
- ✅ 提交信息规范
- ✅ 定期重构优化
- ✅ 持续集成测试

---

## 📚 参考资源

### 内部文档
- [README.md](README.md) - 项目入口
- [DEPLOYMENT.md](DEPLOYMENT.md) - 部署指南
- [MAINTENANCE.md](MAINTENANCE.md) - 维护手册
- [CHANGELOG.md](CHANGELOG.md) - 更新日志

### 外部资源
- [Express 文档](https://expressjs.com/)
- [SQLite 文档](https://www.sqlite.org/)
- [ESLint 规则](https://eslint.org/docs/rules/)
- [JavaScript MDN](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)

---

**最后更新**：2026-06-01
