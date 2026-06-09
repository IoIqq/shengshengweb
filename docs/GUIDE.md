# 声声网络思政工作室 - 开发指南

本指南维护当前项目的架构、启动、部署、维护与 API 参考。开发强制规范见 [CODE_STANDARDS.md](CODE_STANDARDS.md)。

## 开发前必读

项目已完成模块化重构，开发时必须遵守：

- 后端入口：`server/server-new.js`。
- 后端分层：`models -> routes -> server-new.js`。
- 前端模块：`public/js/`。
- 样式模块：`public/css/`，入口为 `public/css/main.css`。
- 禁止修改旧单体：`server/server.js`、`public/styles.css`。
- 按模块分小任务执行，非必要不做全局读取或全局扫描。

## 项目概述

声声网络思政工作室网站是面向高校工作室日常协作的轻量级管理系统，覆盖素材库、审片、待办、团队协作、设备登记与借用、系统设置、留言墙等场景。

## 技术栈

前端：

- HTML5 / CSS3
- 原生 JavaScript ES Modules
- 模块化 CSS
- Service Worker 离线能力

后端：

- Node.js >= 18
- Express
- sql.js SQLite
- Multer 文件上传
- Helmet 安全头
- express-rate-limit 限流
- Cookie 会话、CSRF、角色权限控制

## 目录结构

```text
shengsheng-ideology-studio-site/
├── server/
│   ├── server-new.js       # 当前服务入口
│   ├── config/             # 配置
│   ├── middleware/         # 认证、CSRF、通用中间件
│   ├── models/             # 数据模型与持久化
│   ├── routes/             # API 路由模块
│   ├── utils/              # 工具函数
│   ├── data/               # 数据库文件
│   ├── logs/               # 日志
│   └── uploads/            # 上传文件
├── public/
│   ├── css/                # 模块化 CSS
│   ├── js/                 # 前端模块
│   ├── assets/             # 静态资源
│   └── index.html          # 主页面
├── docs/                   # 当前开发文档
└── _archive/               # 历史归档
```

## 快速开始

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run dev
```

生产模式：

```bash
npm start
```

查看局域网访问地址：

```bash
npm run network
```

PM2：

```bash
npm run pm2:start
npm run pm2:reload
npm run pm2:stop
```

生产环境推荐用 PM2 守护，崩溃后会自动拉起，超过 512MB 也会重启兜底。Windows 可双击 `scripts/start-pm2.bat` 一键启动。常用排障命令：

```bash
pm2 status
pm2 logs shengsheng-studio
pm2 reload shengsheng-studio
```

默认端口由 `.env` 或配置决定，默认本地地址为 `http://localhost:3002`。

## 部署指南

环境要求：

- Node.js >= 18.0.0
- npm >= 8.0.0
- 可写入 `server/data/`、`server/logs/`、`server/uploads/`

步骤：

```bash
npm install
cp .env.example .env
npm start
```

常用环境变量：

```env
PORT=3002
HOST=0.0.0.0
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
GUEST_USERNAME=guest
GUEST_PASSWORD=guest123
MAX_UPLOAD_MB=200
```

局域网无法访问时，检查防火墙、同一 Wi-Fi、路由器客户端隔离设置。Windows 可使用 `scripts/open-firewall.bat` 配置防火墙。

## 维护手册

代码检查：

```bash
npm run lint
npm run lint:fix
npm run format:check
```

日志和数据库维护：

```bash
npm run maintenance
```

关键路径：

- 数据库：`server/data/studio.sqlite`
- 日志：`server/logs/`
- 上传：`server/uploads/`

运行时维护：

- 数据库写盘已节流，事务结束或写操作 200ms 内会异步落盘，关停时同步刷盘。
- 后端启动后会立即跑一次清理，并每 6 小时自动清理过期会话、超过 90 天的审计日志和 activity 记录，详见 `server/utils/maintenance-scheduler.js`。
- PM2 守护下，未捕获异常会主动退出并由 PM2 拉起，可在 `server/logs/pm2-error.log` 查看崩溃栈。

常见问题：

| 问题 | 处理 |
| --- | --- |
| 端口占用 | 查找占用 `3002` 的进程后关闭，或临时设置其他 `PORT`。 |
| 数据库写入异常 | 确保只有一个服务实例运行，并检查 `server/data/` 权限。 |
| 上传失败 | 检查文件大小、上传目录权限和磁盘空间。 |
| 静态资源 404 | 确认页面引用 `css/main.css` 与 `js/app-modular.js`，不要引用旧单体文件。 |

## 身份分级与权限

系统当前使用三类角色，权限来源以 `server/config/permissions.js` 和各路由中间件为准。

| 角色 | 定位 | 可见/可用范围 | 特殊限制 |
| --- | --- | --- | --- |
| `admin` | 管理员 | 全部工作台模块、用户管理、系统设置、备份、审计日志。 | 拥有 `*` 权限。 |
| `editor` | 编辑者 | 素材上传与审核、待办管理、团队/设备/借用查看、借用申请、留言发布、个人资料。 | 不能进入系统设置、用户管理、审计日志、备份；不能创建设备、删除素材、审批借用。 |
| `guest` | 访客 | 访客工作台，只读查看素材、待办、团队和留言。 | 不能进入系统设置；不能上传、审核、创建、更新、删除或管理账号。 |

登录入口：管理员和编辑者使用账号密码登录；访客可点击“访客进入”，由后端使用默认 `guest` 账号创建只读会话，前端不暴露访客密码。

## API 参考

当前 API 由 11 个路由模块提供，共 55 个端点。所有写操作默认需要 CSRF；权限以路由实际中间件为准。

### 认证 `/api`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/session` | 公开 | 查询当前会话。 |
| POST | `/api/login` | 公开，限流 | 登录并设置会话 Cookie。 |
| POST | `/api/login/guest` | 公开，限流 | 以默认访客账号创建只读访客会话。 |
| POST | `/api/logout` | 登录 | 登出并清理会话。 |

### 注册申请 `/api/registration-requests`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/registration-requests` | 公开，限流 | 提交账号注册申请。 |
| GET | `/api/registration-requests` | 管理员 | 获取注册申请列表，默认返回待审核。 |
| PATCH | `/api/registration-requests/:id` | 管理员 | 通过或拒绝注册申请；通过时创建账号并设置初始密码。 |

### 用户 `/api/users`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/users` | 管理员 | 获取用户列表。 |
| POST | `/api/users` | 管理员 | 创建用户。 |
| PATCH | `/api/users/:id` | 管理员 | 更新用户资料、角色或密码。 |
| DELETE | `/api/users/:id` | 管理员 | 删除用户。 |
| PATCH | `/api/users/:id/status` | 管理员 | 启用或禁用用户。 |

### 待办 `/api/todos`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/todos` | 登录 | 获取待办列表。 |
| POST | `/api/todos` | 编辑及以上 | 创建待办。 |
| PATCH | `/api/todos/:id` | 编辑及以上 | 更新待办。 |
| DELETE | `/api/todos/:id` | 编辑及以上 | 删除待办。 |

### 素材 `/api/media`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/media/sync` | 编辑及以上 | 从 inbox 同步素材。 |
| POST | `/api/media/upload` | 编辑及以上，限流 | 上传图片或视频素材。 |
| POST | `/api/media/:id/review` | 编辑及以上 | 审核素材。 |
| DELETE | `/api/media/:id` | 管理员 | 删除素材。 |

### 设备 `/api/devices`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/devices/options` | 登录 | 获取类别、位置、责任人推荐值。 |
| GET | `/api/devices` | 登录 | 获取设备列表。 |
| GET | `/api/devices/:id` | 登录 | 获取单个设备。 |
| POST | `/api/devices` | 管理员 | 创建设备。 |
| PATCH | `/api/devices/:id` | 管理员 | 更新设备。 |
| POST | `/api/devices/:id/image` | 编辑及以上，限流 | 上传设备图片。 |
| DELETE | `/api/devices/:id` | 管理员 | 删除设备。 |

### 借用申请 `/api/borrow-requests`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/borrow-requests` | 登录 | 获取借用申请列表。 |
| GET | `/api/borrow-requests/overdue` | 登录 | 获取逾期借用列表。 |
| GET | `/api/borrow-requests/stats` | 登录 | 获取借用统计。 |
| GET | `/api/borrow-requests/:id` | 登录 | 获取单个借用申请。 |
| POST | `/api/borrow-requests` | 编辑及以上，限流 | 创建借用申请。 |
| PATCH | `/api/borrow-requests/:id` | 管理员 | 审批、拒绝或归还。 |
| DELETE | `/api/borrow-requests/:id` | 管理员 | 删除借用记录。 |

### 团队 `/api/team`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/team` | 登录 | 获取团队成员列表。 |
| GET | `/api/team/:id/contribution` | 登录 | 获取成员贡献统计。 |
| POST | `/api/team` | 管理员，限流 | 创建团队成员。 |
| PATCH | `/api/team/:id` | 管理员 | 更新团队成员。 |
| DELETE | `/api/team/:id` | 管理员 | 删除团队成员。 |
| PATCH | `/api/team/:id/order` | 管理员 | 调整成员排序。 |

### 个人资料 `/api/profile`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/profile/summary` | 登录 | 获取个人活动概要。 |
| PATCH | `/api/profile` | 登录 | 更新个人资料。 |
| POST | `/api/profile/password` | 登录 | 修改密码。 |
| POST | `/api/profile/avatar` | 登录，限流 | 上传头像。 |

### 审计日志 `/api/audit-logs`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/audit-logs` | 管理员 | 查询审计日志，支持筛选和分页。 |
| GET | `/api/audit-logs/export` | 管理员 | 导出审计日志 CSV。 |

### 系统 `/api`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/bootstrap` | 登录 | 获取应用初始化数据。 |
| GET | `/api/backup` | 管理员 | 导出 JSON 备份。 |
| GET | `/api/backup/database` | 管理员 | 导出 SQLite 数据库文件。 |
| GET | `/api/settings` | 管理员 | 获取站点设置。 |
| PATCH | `/api/settings` | 管理员 | 更新站点设置。 |
| GET | `/api/wishes` | 公开 | 获取留言墙消息。 |
| POST | `/api/wishes` | 登录，限流 | 发布留言。 |
| DELETE | `/api/wishes/:id` | 管理员 | 删除留言。 |
| GET | `/api/health` | 公开 | 健康检查。 |
| POST | `/api/client-log` | 公开，限流 | 上报客户端错误日志。 |

## 文档维护规则

- 架构、部署、维护、API 变化更新本文档。
- 强制开发规范变化更新 `CODE_STANDARDS.md`。
- 历史报告只作参考，不作为当前实现依据。

**最后更新**：2026-06-05
