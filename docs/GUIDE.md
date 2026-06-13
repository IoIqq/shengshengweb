# 声声网络思政工作室 - 开发指南

本指南维护架构、部署、维护与 API 参考。开发强制规范见 [CODE_STANDARDS.md](CODE_STANDARDS.md)。

## 开发前必读

- 后端入口：`server/server-new.js`，分层：`models → routes → server-new.js`
- 前端模块：`public/js/`；样式模块：`public/css/`，入口 `public/css/main.css`
- 禁止修改旧单体：`server/server.js`、`public/styles.css`
- 按模块分小任务执行，非必要不做全局读取

## 技术栈

- **后端**: Node.js ≥18, Express 4, sql.js (SQLite), Multer, Helmet, express-rate-limit
- **前端**: 原生 HTML/CSS/JS ES Modules，CSS Variables + Grid，Service Worker
- **认证**: Cookie 会话 + CSRF + RBAC（admin/editor/guest）

## 目录结构

```text
server/
  server-new.js          # 当前入口
  config/ middleware/ models/ routes/ utils/ scripts/
  data/ logs/ uploads/
public/
  css/  (base/ layout/ components/ pages/ responsive/ utilities/)
  js/   (core/ modules/ ui/ utils/)
  index.html
docs/                    # 开发文档
```

## 部署

```bash
npm install
cp .env.example .env     # 编辑配置
npm start                # 或 npm run pm2:start（生产推荐 PM2）
```

常用环境变量：`PORT`、`HOST`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`MAX_UPLOAD_MB`。

局域网无法访问时：检查防火墙、同一 Wi-Fi、路由器客户端隔离。Windows 可用 `scripts/open-firewall.bat`。

## 维护

```bash
npm run lint / lint:fix          # ESLint
npm run format:check             # Prettier
npm run maintenance              # 日志清理 + 数据维护
```

关键路径：数据库 `server/data/studio.sqlite`，日志 `server/logs/`，上传 `server/uploads/`。

运行时：数据库写盘节流（200ms 异步落盘，关停同步刷盘）；每 6 小时自动清理过期会话和 90 天前的审计日志。

| 常见问题 | 处理 |
|---------|------|
| 端口占用 | `npx kill-port 48080` 或改 PORT |
| 上传失败 | 检查文件大小、上传目录权限、磁盘空间 |
| 静态资源 404 | 确认引用 `css/main.css` 和 `js/app-modular.js` |

## 身份分级与权限

| 角色 | 范围 | 限制 |
|------|------|------|
| `admin` | 全部模块、用户管理、系统设置、备份、审计 | 无 |
| `editor` | 上传审核、待办管理、团队/设备/借用查看、留言、个人资料 | 无系统设置、用户管理、审计、备份；不可创建设备/删素材/批借用 |
| `guest` | 只读查看素材、待办、团队、留言 | 不可上传、审核、创建、更新、删除、管理账号 |

访客点击"访客进入"由后端创建只读会话，前端不暴露密码。

## API 参考

11 个路由模块，55 个端点。所有写操作需 CSRF，权限以路由中间件为准。

### 认证 `/api`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/session` | 公开 |
| POST | `/api/login` | 公开，限流 |
| POST | `/api/login/guest` | 公开，限流 |
| POST | `/api/logout` | 登录 |

### 注册申请 `/api/registration-requests`

| 方法 | 路径 | 权限 |
|------|------|------|
| POST | `/api/registration-requests` | 公开，限流 |
| GET | `/api/registration-requests` | 管理员 |
| PATCH | `/api/registration-requests/:id` | 管理员 |

### 用户 `/api/users`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/users` | 管理员 |
| POST | `/api/users` | 管理员 |
| PATCH | `/api/users/:id` | 管理员 |
| DELETE | `/api/users/:id` | 管理员 |
| PATCH | `/api/users/:id/status` | 管理员 |

### 待办 `/api/todos`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/todos` | 登录 |
| POST | `/api/todos` | 编辑及以上 |
| PATCH | `/api/todos/:id` | 编辑及以上 |
| DELETE | `/api/todos/:id` | 编辑及以上 |

### 素材 `/api/media`

| 方法 | 路径 | 权限 |
|------|------|------|
| POST | `/api/media/sync` | 编辑及以上 |
| POST | `/api/media/upload` | 编辑及以上，限流 |
| POST | `/api/media/:id/review` | 编辑及以上 |
| DELETE | `/api/media/:id` | 管理员 |

### 设备 `/api/devices`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/devices/options` | 登录 |
| GET | `/api/devices` | 登录 |
| POST | `/api/devices` | 管理员 |
| PATCH | `/api/devices/:id` | 管理员 |
| POST | `/api/devices/:id/image` | 编辑及以上，限流 |
| DELETE | `/api/devices/:id` | 管理员 |

### 借用 `/api/borrow-requests`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/borrow-requests` | 登录 |
| POST | `/api/borrow-requests` | 编辑及以上，限流 |
| PATCH | `/api/borrow-requests/:id` | 管理员 |
| DELETE | `/api/borrow-requests/:id` | 管理员 |

### 团队 `/api/team`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/team` | 登录 |
| POST | `/api/team` | 管理员，限流 |
| PATCH | `/api/team/:id` | 管理员 |
| DELETE | `/api/team/:id` | 管理员 |

### 个人资料 `/api/profile`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/profile/summary` | 登录 |
| PATCH | `/api/profile` | 登录 |
| POST | `/api/profile/password` | 登录 |
| POST | `/api/profile/avatar` | 登录，限流 |

### 审计 `/api/audit-logs`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/audit-logs` | 管理员 |
| GET | `/api/audit-logs/export` | 管理员 |

### 系统 `/api`

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/bootstrap` | 登录 |
| GET | `/api/backup` | 管理员 |
| GET | `/api/settings` | 管理员 |
| PATCH | `/api/settings` | 管理员 |
| GET | `/api/wishes` | 公开 |
| POST | `/api/wishes` | 登录，限流 |
| DELETE | `/api/wishes/:id` | 管理员 |
| GET | `/api/health` | 公开 |

## 文档维护

- 架构/部署/API 变化 → 更新本文
- 强制开发规范变化 → 更新 `CODE_STANDARDS.md`
- 不在多个文档重复维护同一事实

**最后更新**：2026-06-13（精简：去除与 README_PROJECT 重复的快速开始，压缩 API 表）