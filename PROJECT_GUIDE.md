# 项目指南
> 最后更新：2026-05-30

## 1. 快速启动

### 本地开发

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:3002
```

如果 PowerShell 提示 `npm.ps1` 被禁止执行，直接改用：

```bash
npm.cmd run dev
```

### 生产启动

```bash
npm run start
```

也可以使用：

```bash
npm run prod
npm run pm2:start
```

默认监听：

- `HOST=0.0.0.0`
- `PORT=3002`

### 访问地址

- 本机访问：`http://127.0.0.1:3002`
- 局域网访问：`http://<本机局域网IP>:3002`

如果手机或另一台电脑访问失败，优先确认两台设备在同一个网络里。

---

## 2. 部署与数据

### 默认数据位置

- 数据库：`server/data/studio.sqlite`
- 上传图片：`server/uploads/media`
- 服务端收件箱：`server/uploads/inbox`

### 环境变量

项目通过根目录 `.env` 配置运行路径：

```env
PORT=3002
HOST=0.0.0.0
DATABASE_PATH=server/data/studio.sqlite
UPLOAD_DIR=server/uploads
INBOX_DIR=server/uploads/inbox
MAX_UPLOAD_MB=200
MAX_UPLOAD_FILES=30
```

实际运行端口与路径以根目录 `.env` 为准（`.env.example` 仅为模板默认值）。

### 外部磁盘部署

数据库与上传目录的路径由 `resolvePath()` 解析：支持绝对路径、相对路径（相对项目根目录），会自动规范化，Windows / Linux / Mac 通用。如果你想把数据放到外部硬盘或独立数据盘，推荐使用绝对路径：

```env
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox
```

也可以使用相对路径，但要保证它们相对于项目根目录始终正确：

```env
DATABASE_PATH=../data/database.sqlite
UPLOAD_DIR=../uploads
INBOX_DIR=../uploads/inbox
```

### 迁移步骤

1. 停止服务
2. 备份 `server/data` 和 `server/uploads`
3. 修改 `.env`
4. 重启服务

服务启动时会自动创建缺失目录，但不会替你修正错误路径。

### 备份建议

- 定期备份 `database.sqlite`
- 同步 `uploads` 目录
- 外部磁盘建议使用 SSD，减少频繁插拔

---

## 3. 安全机制

后端已内置以下防护，均在 `server/server.js` 中实现：

- **Helmet 安全头**：设置 CSP、防点击劫持、禁用 MIME 嗅探等响应头。
- **速率限制**：
  - 全局：15 分钟内最多 1000 次请求
  - 登录：15 分钟内最多 5 次尝试（防暴力破解）
  - 上传：限制写操作频率
- **密码加密**：用户密码使用 scrypt 加盐哈希存储，校验时用 timingSafeEqual 防时序攻击。
- **CSRF 防护**：双提交校验（`ss_csrf` cookie + `X-CSRF-Token` 请求头），保护所有非 GET 的 `/api/*` 写操作。
- **SQL 注入防护**：所有数据库写操作使用参数化查询。
- **HSTS**：生产环境强制 HTTPS；开发环境自动关闭，方便局域网 HTTP 访问。

---

## 4. 手机访问与排障

### 当前状态

项目的移动端支持已经内置，不需要再手工补 `index.html` 或 `server/server.js`：

- `index.html` 已包含移动端 meta、汉堡菜单和移动端抽屉
- `server/server.js` 在开发环境下会关闭 HSTS
- 服务绑定在 `0.0.0.0`，可以被局域网设备访问

### 手机访问步骤

1. 确认电脑上的服务已经运行
2. 手机和电脑连接同一个 Wi-Fi
3. 在电脑上查询局域网 IP
4. 在手机浏览器打开：

```text
http://<电脑局域网IP>:3002
```

### 常见问题

- 如果打不开，先检查 Windows 防火墙是否拦截了 `3002` 端口
- 如果页面强制跳 HTTPS，确认当前是开发模式还是反向代理后的生产模式
- 如果浏览器显示旧页面，刷新缓存或重新确认当前运行的是这份源码

### 适用提醒

- `127.0.0.1` 只能在本机访问，手机不能直接用这个地址
- 如果你改了 `PORT`，手机访问地址也要跟着改

---

## 5. 代码导航

### 前端核心文件

- `config.js`
  - 集中配置入口
  - 通过 `window.shengshengConfig` 暴露 API、UI 常量、验证规则、排序器和视图标签
- `app.js`
  - 前端主逻辑入口
  - 负责状态、请求封装、渲染、事件绑定、CRUD、登录与启动
- `wish-wall.js`
  - 独立的留言墙功能模块

### 后端核心文件

- `server/server.js`
  - 单文件后端
  - 负责数据库初始化、认证、路由、静态资源与启动逻辑

### 常用函数定位

#### 如果你要改登录或会话

- `loadSession()`
- `login()`
- `logout()`
- `start()`

#### 如果你要改首页概览

- `renderDashboard()`
- `setActiveView()`
- `refreshAll()`

#### 如果你要改素材

- `renderMedia()`
- `reviewMedia()`
- `syncMedia()`

#### 如果你要改待办

- `renderTodos()`
- `createTodo()`
- `toggleTodo()`
- `deleteTodo()`

#### 如果你要改设备

- `renderDevices()`
- `createDevice()`
- `updateDevice()`
- `deleteDevice()`

#### 如果你要改借出

- `renderBorrowRequests()`
- `renderBorrowDeviceSelect()`
- `createBorrowRequest()`
- `updateBorrowRequest()`

#### 如果你要改团队

- `renderTeam()`

#### 如果你要改设置

- `renderSettings()`
- `saveSettings()`

#### 如果你要改通用层

- `request()`
- `requestJSON()`
- `showToast()`
- `showFeedback()`
- `bindEvents()`

### 后端常用搜索点

如果你要定位 `server/server.js` 的某个功能，直接搜这些关键词最稳：

- `initDatabase`
- `/api/login`
- `/api/bootstrap`
- `/api/devices`
- `/api/borrow-requests`
- `/api/team`
- `app.listen`

---

## 6. 开发约定

### 配置原则

- 新增配置优先放到 `config.js`
- 前端尽量从 `window.shengshengConfig` 读取，不要在 `app.js` 里重复定义常量

### 渲染原则

- `render*` 负责渲染 DOM
- `refresh*` 负责拉数据并刷新视图
- `sync*` 负责把缓存同步到视图
- `load*` 负责首次加载

### 事件原则

- 所有事件监听优先集中在 `bindEvents()`
- 动态卡片优先使用事件委托
- 不要在 `render*()` 里给每张卡片重复绑定监听器

### 网络原则

- API 请求统一走 `request()` / `requestJSON()`
- 需要写操作时，让封装自动带上 CSRF token
- 失败提示优先走 `showToast()` 或 `showFeedback()`

### 命名原则

- `render*`：渲染
- `refresh*`：刷新
- `sync*`：同步
- `load*`：首次加载
- `create/update/delete*`：增删改
- `validate*`：校验
- `is*` / `has*`：判断
- `get*`：获取
- `set*`：设置

---

## 7. 常见故障

### 页面打不开

- 确认服务是否已启动
- 确认访问的是 `3002` 而不是旧端口
- 确认 `.env` 里的 `PORT` 与实际一致
- 确认防火墙没有拦截端口

### 借出接口 404

- 检查当前运行的进程是不是最新源码
- 检查路由是否来自这份仓库
- 确认访问的是 `POST /api/borrow-requests`

### 未登录却能看到页面

- 检查 session 是否过期
- 检查登录状态是否正确写入 cookie
- 检查浏览器是否缓存了旧状态

### 数据目录异常

- 检查 `DATABASE_PATH`
- 检查 `UPLOAD_DIR`
- 检查 `INBOX_DIR`
- 检查目录写入权限

---

## 8. 相关文件

- `README.md` - 用户快速上手
- `server/REFACTORING.md` - 后端重构说明