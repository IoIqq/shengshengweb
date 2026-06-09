# 声声网络思政工作室网站

> **⚠️ 开发者必读：在开始任何开发工作前，务必先阅读 [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md) 和 [docs/GUIDE.md](docs/GUIDE.md)，了解项目架构、模块化规范和开发约束。**

轻量级工作室协作管理系统，覆盖素材管理、审片、待办、团队协作、设备登记与借用、系统设置等日常场景。

## 📋 目录

- [快速开始](#快速开始)
- [开发前必读](#开发前必读)
- [项目结构](#项目结构)
- [文档导航](#文档导航)
- [常用命令](#常用命令)
- [技术栈](#技术栈)
- [功能模块](#功能模块)

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产模式

```bash
npm start
```

### 局域网访问

```bash
npm run network
```

Windows 用户可使用一键启动脚本：`scripts/启动.bat`

---

## 开发前必读

### ⚠️ 强制规范

**在修改任何代码前，必须阅读：**

1. **[docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)** — 模块化开发强制规范
2. **[docs/GUIDE.md](docs/GUIDE.md)** — 架构、API、部署与维护指南
3. **[docs/README.md](docs/README.md)** — 文档目录索引

### 核心原则

项目已完成模块化重构，后续开发必须严格遵守：

- ✅ 后端入口使用 `server/server-new.js`
- ✅ 后端新增能力按 `models -> routes -> server-new.js` 组织
- ✅ 前端功能代码放在 `public/js/modules/` 对应模块
- ✅ 样式只写入 `public/css/` 对应模块，通过 `public/css/main.css` 汇总
- ❌ **禁止**修改旧单体文件 `server/server.js`、`public/styles.css`
- ⚠️ 每次改动按模块分小任务执行，**非必要不做全局读取或全局扫描**

---

## 项目结构

```text
shengsheng-ideology-studio-site/
├── server/                 # 后端模块
│   ├── server-new.js       # ✅ 当前服务入口
│   ├── config/             # 配置文件
│   ├── middleware/         # 认证、CSRF、日志中间件
│   ├── models/             # 数据模型与 SQLite 持久化
│   ├── routes/             # API 路由模块
│   ├── scripts/            # 维护脚本
│   └── utils/              # 工具函数
├── public/                 # 前端静态资源
│   ├── index.html          # 主页面入口
│   ├── css/                # 模块化 CSS
│   │   ├── base/           # 变量、排版、动画
│   │   ├── layout/         # 网格、工作区、导航
│   │   ├── components/     # 按钮、表单、卡片、模态框
│   │   ├── pages/          # 页面特定样式
│   │   ├── responsive/     # 响应式断点
│   │   └── main.css        # ✅ CSS 汇总入口
│   └── js/                 # 原生 ES 模块
│       ├── app-modular.js  # ✅ 应用主入口
│       ├── core/           # 状态、DOM、配置
│       ├── modules/        # 功能模块（dashboard、media、todo）
│       ├── ui/             # UI 组件（toast、navigation）
│       └── utils/          # 工具函数
├── docs/                   # ✅ 当前开发文档
│   ├── README.md           # 文档目录
│   ├── CODE_STANDARDS.md   # 强制开发规范
│   ├── GUIDE.md            # 架构与 API 指南
│   └── archive/            # 历史报告归档
└── _archive/               # 旧代码归档，仅供参考
```

---

## 文档导航

### 核心文档（必读）

| 文档 | 用途 |
|-----|------|
| [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md) | **强制开发规范** — 模块化架构、禁止事项、分层设计 |
| [docs/GUIDE.md](docs/GUIDE.md) | **架构与 API 指南** — 技术栈、目录结构、API 参考 |
| [docs/README.md](docs/README.md) | **文档索引** — 完整文档导航 |

### 历史报告（参考）

| 文档 | 内容 |
|-----|------|
| [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) | 模块化重构完成报告 |
| [UI_OPTIMIZATION_P2_COMPLETE.md](UI_OPTIMIZATION_P2_COMPLETE.md) | UI 间距优化完成报告 |
| [DOCS_SUMMARY.md](DOCS_SUMMARY.md) | 文档整合历史记录 |

---

## 常用命令

```bash
# 开发与运行
npm run dev          # 开发模式（nodemon 热重载）
npm start            # 生产模式
npm run network      # 显示局域网访问地址
npm run pm2:start    # 使用 PM2 启动生产服务

# 代码质量
npm run lint         # ESLint 代码检查
npm run lint:fix     # 自动修复 ESLint 问题
npm run format       # Prettier 格式化
npm run format:check # Prettier 格式检查
npm run check        # lint + npm audit

# 维护
npm run maintenance  # 日志清理与数据维护
npm run clean        # 清理 node_modules 并重新安装
```

---

## 技术栈

### 后端

- **运行时**: Node.js >= 18
- **框架**: Express 4.x
- **数据库**: sql.js (SQLite in-memory + 持久化)
- **安全**: Helmet, CSRF Protection, Rate Limiting
- **认证**: Session-based + Role-based Access Control
- **文件上传**: Multer

### 前端

- **架构**: 原生 HTML / CSS / JavaScript ES Modules（无构建工具）
- **模块化**: ES6 Modules, 组件化设计
- **样式**: CSS Variables, CSS Grid, Flexbox
- **响应式**: Mobile-first, 6 个断点（360px-1200px+）

### 开发工具

- **代码规范**: ESLint, Prettier
- **进程管理**: PM2（生产环境）
- **开发热重载**: nodemon

---

## 功能模块

### 核心功能

- 📁 **素材库** — 图片/视频上传、分类、标签、搜索
- ✅ **审片中心** — 素材审核工作流（pending/approved/rejected）
- 📝 **待办事项** — 个人与团队任务管理
- 👥 **团队管理** — 成员信息、角色权限、贡献统计
- 🖥️ **设备登记** — 设备清单、借用审批
- 🎨 **展示页** — 公开素材展示（登录前可见）
- ⚙️ **系统设置** — 站点配置、存储管理、主题切换

### 权限角色

- **admin** — 管理员（全权限）
- **editor** — 编辑者（上传、审核、管理）
- **guest** — 访客（只读权限）

### 安全特性

- Session-based 认证 + CSRF 保护
- 角色权限控制（RBAC）
- 审计日志记录
- Rate limiting（登录、上传）
- Helmet 安全头
- 文件类型与大小验证

---

## 开发工作流

1. **阅读文档** — 先看 [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)
2. **创建分支** — 从 main 分支创建功能分支
3. **模块化开发** — 按 `models -> routes -> frontend` 顺序
4. **代码检查** — `npm run lint` 确保 0 errors
5. **本地测试** — `npm run dev` 验证功能
6. **提交代码** — 遵循 Conventional Commits 规范

---

## 许可证

本项目仅供声声网络思政工作室内部使用。

