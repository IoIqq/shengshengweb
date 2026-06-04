# 声声网络思政工作室 - 开发指南

> 本指南整合了项目架构、部署方法和维护手册

## ⚠️ 开发前必读

**本项目已完成模块化重构（2026-06-04），请严格遵守模块化规范！**

详见 [CODE_STANDARDS.md](CODE_STANDARDS.md)

---

## 📑 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [部署指南](#部署指南)
- [维护手册](#维护手册)
- [API文档](#api文档)

---

## 📌 项目概述

**声声网络思政工作室网站** 是一个面向工作室日常协作的轻量级管理系统。

### 核心功能
- 🖼️ **素材库** - 图片和视频管理、审核
- ✅ **审片中心** - 素材审核、备注
- 📋 **待办事项** - 任务管理、优先级
- 👥 **团队协作** - 成员管理、状态跟踪
- 🔧 **设备管理** - 设备库存、借出记录
- ⚙️ **系统设置** - 网站配置、用户管理
- 💬 **留言墙** - 互动留言

---

## 🛠️ 技术栈

### 前端
- **HTML5/CSS3** - 基础结构和样式（27个CSS模块）
- **JavaScript (ES6+)** - 模块化原生JS
- **Service Worker** - 离线支持

### 后端
- **Node.js** (>= 18.0.0) - 运行环境
- **Express** - Web框架
- **SQLite** (sql.js) - 数据库
- **Multer** - 文件上传
- **Helmet** - 安全防护
- **express-rate-limit** - 登录速率限制（1分钟5次）

---

## 📁 目录结构

```
shengsheng-ideology-studio-site/
├── server/                     # 后端代码（模块化）
│   ├── server-new.js           # 主入口（208行）
│   ├── config/                 # 配置
│   ├── middleware/             # 中间件
│   ├── models/                 # 数据模型（9个）
│   ├── routes/                 # 路由（10个）
│   ├── utils/                  # 工具函数
│   ├── data/                   # 数据库
│   ├── logs/                   # 日志
│   └── uploads/                # 上传文件
│
├── public/                     # 前端静态文件
│   ├── css/                    # 样式（27个模块）
│   │   ├── base/               # 基础层（4个）
│   │   ├── layout/             # 布局层（4个）
│   │   ├── components/         # 组件层（9个）
│   │   ├── pages/              # 页面层（5个）
│   │   ├── responsive/         # 响应式（3个）
│   │   └── utilities/          # 工具类（2个）
│   ├── js/                     # JavaScript模块
│   └── index.html              # 主页面
│
├── docs/                       # 文档
│   ├── GUIDE.md                # 本文档
│   ├── CODE_STANDARDS.md       # 开发规范
│   ├── CHANGELOG.md            # 变更日志
│   └── archive/                # 历史文档
│
├── _archive/                   # 归档代码
│   ├── server/                 # 旧server.js
│   └── styles/                 # 旧styles.css
│
└── 配置文件
    ├── package.json
    ├── .env.example
    └── ecosystem.config.js
```

---

## 🚀 快速开始

### 方式1：Windows一键启动（推荐）

双击 `scripts/启动.bat`

首次使用：
1. 运行 `scripts/setup.bat` - 安装依赖
2. 运行 `scripts/open-firewall.bat` - 配置防火墙（需管理员）
3. 运行 `scripts/启动.bat` - 启动服务

### 方式2：命令行启动

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 启动生产模式
npm run start
```

### 方式3：PM2守护进程

```bash
npm run pm2:start
```

### 访问地址

- 本地：http://localhost:3002
- 局域网：运行 `npm run network` 查看

---

## 📦 部署指南

### 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- 磁盘空间 >= 500MB

### 部署步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd shengsheng-ideology-studio-site
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=3002
HOST=0.0.0.0

# 管理员账号（务必修改！）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# 访客账号
GUEST_USERNAME=guest
GUEST_PASSWORD=guest123

# 上传配置
MAX_UPLOAD_MB=200
```

#### 3. 安装依赖

```bash
npm install
```

#### 4. 启动服务

**开发环境：**
```bash
npm run dev
```

**生产环境：**
```bash
npm run prod
```

**使用PM2：**
```bash
npm run pm2:start
```

### Windows防火墙配置

如果局域网无法访问，运行：

```cmd
scripts\open-firewall.bat
```

（需要管理员权限）

### 数据备份

数据库文件位置：`server/data/studio.sqlite`

定期备份：
```bash
npm run maintenance
```

---

## 🔧 维护手册

### 日常维护

#### 1. 查看日志

```bash
# 错误日志
tail -f server/logs/error-*.log

# 请求日志
tail -f server/logs/request-*.log
```

#### 2. 清理日志

日志会自动轮转，保留30天。手动清理：

```bash
npm run maintenance
```

#### 3. 数据库备份

```bash
# 自动备份到 server/data/backups/
npm run maintenance
```

#### 4. 代码检查

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint:fix
```

### 常见问题

#### 问题1：端口被占用

**错误**: `EADDRINUSE: address already in use`

**解决**:
```bash
# Windows
netstat -ano | findstr :3002
taskkill /PID <进程ID> /F

# Linux/Mac
lsof -i :3002
kill -9 <进程ID>
```

#### 问题2：数据库锁定

**错误**: `SQLITE_BUSY: database is locked`

**解决**:
1. 确保没有多个服务器实例运行
2. 重启服务器
3. 如果问题持续，检查 `server/data/studio.sqlite-journal` 文件

#### 问题3：上传失败

**检查**:
1. 文件大小是否超过限制（默认200MB）
2. `server/uploads/` 目录权限
3. 磁盘空间是否充足

#### 问题4：移动端无法访问

**检查**:
1. 手机和电脑是否在同一Wi-Fi
2. Windows防火墙是否放行
3. 路由器是否开启客户端隔离

### 性能优化

#### 1. 数据库优化

```bash
# 定期运行维护脚本
npm run maintenance
```

#### 2. 日志管理

日志自动轮转，单文件最大5MB，保留30天。

#### 3. 静态资源

生产环境建议使用Nginx反向代理处理静态文件。

---

## 📡 API文档

### 认证

所有写操作需要登录，通过Cookie携带session。

### 端点列表

#### 认证 (3个)
- `POST /api/login` - 登录
- `POST /api/logout` - 登出
- `GET /api/session` - 查询会话

#### 用户管理 (5个)
- `GET /api/users` - 获取用户列表
- `GET /api/users/:id` - 获取单个用户
- `POST /api/users` - 创建用户
- `PATCH /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

#### 媒体管理 (4个)
- `POST /api/media/sync` - 同步素材
- `POST /api/media/upload` - 上传媒体
- `POST /api/media/:id/review` - 审核素材
- `DELETE /api/media/:id` - 删除素材

#### 设备管理 (5个)
- `GET /api/devices` - 获取设备列表
- `GET /api/devices/:id` - 获取单个设备
- `POST /api/devices` - 创建设备
- `PATCH /api/devices/:id` - 更新设备
- `DELETE /api/devices/:id` - 删除设备

#### 借用申请 (4个)
- `GET /api/borrow-requests` - 获取借用列表
- `GET /api/borrow-requests/:id` - 获取单个申请
- `POST /api/borrow-requests` - 创建申请
- `PATCH /api/borrow-requests/:id` - 审批/归还

#### 团队管理 (5个)
- `GET /api/team` - 获取团队成员
- `POST /api/team` - 添加成员
- `PATCH /api/team/:id` - 更新成员
- `DELETE /api/team/:id` - 删除成员
- `PATCH /api/team/:id/order` - 调整排序

#### 待办事项 (4个)
- `GET /api/todos` - 获取待办列表
- `POST /api/todos` - 创建待办
- `PATCH /api/todos/:id` - 更新待办
- `DELETE /api/todos/:id` - 删除待办

#### 个人资料 (3个)
- `PATCH /api/profile` - 更新资料
- `POST /api/profile/password` - 修改密码
- `POST /api/profile/avatar` - 上传头像

#### 审计日志 (2个)
- `GET /api/audit-logs` - 查询日志
- `GET /api/audit-logs/export` - 导出CSV

#### 系统功能 (11个)
- `GET /api/bootstrap` - 初始化数据
- `GET /api/backup` - 导出JSON备份
- `GET /api/backup/database` - 导出数据库
- `GET /api/settings` - 获取设置
- `PATCH /api/settings` - 更新设置
- `GET /api/wishes` - 获取留言
- `POST /api/wishes` - 发布留言
- `DELETE /api/wishes/:id` - 删除留言
- `GET /api/health` - 健康检查
- `GET /api/routes` - 路由列表
- `POST /api/client-log` - 客户端日志

**总计：46个API端点**

---

## 📞 技术支持

- 开发规范：[CODE_STANDARDS.md](CODE_STANDARDS.md)
- 变更日志：[CHANGELOG.md](CHANGELOG.md)
- 重构报告：[../REFACTORING_SUMMARY.md](../REFACTORING_SUMMARY.md)

---

**最后更新**: 2026-06-04
