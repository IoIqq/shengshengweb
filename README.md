# shengshengweb

这是一个面向工作室日常协作的轻量级站点，提供素材管理、审片、待办、团队和设备借出等能力。后端基于 `Node.js + Express`，数据使用 `SQLite` 本地落盘，图片和视频直接保存在服务器磁盘上。

## 功能

- 素材库：浏览、筛选和搜索图片与视频
- 审片中心：通过、退回、备注
- 待办事项：新增、完成、删除
- 服务器照片同步：自动扫描 `server/uploads/inbox`
- 管理员登录：保护写操作
- 运行状态：展示同步状态、登录状态和基础运行信息

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
copy .env.example .env
```

3. 启动项目

```bash
npm run dev
```

4. 打开站点

```text
http://127.0.0.1:3002
```

如果需要让同一局域网里的手机或电脑访问，请直接打开：

```text
http://<本机局域网IP>:3002
```

默认服务监听 `0.0.0.0`。如果外部设备访问失败，优先检查系统防火墙是否放行 `3002` 端口。

## 部署

- Node.js 18+
- 安装生产依赖：`npm install --omit=dev`
- 启动服务：`npm run start`
- 使用 PM2：`npm run pm2:start`

## 数据目录

- 数据库：`server/data/studio.sqlite`
- 上传图片：`server/uploads/media`
- 服务端收件箱：`server/uploads/inbox`

外部硬盘部署、安全机制、代码导航等完整说明见 `PROJECT_GUIDE.md`。

## 默认账号

项目的管理员账号由 `.env` 里的这两个变量控制：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

上线前请务必修改默认密码。

## 排障提示

如果页面无法正常打开，可以优先检查下面几项：

- 服务是否已经启动
- `.env` 里的 `PORT` 是否仍然是 `3002`
- 数据库文件 `server/data/studio.sqlite` 是否存在
- `server/uploads/` 目录是否有写入权限

如果 GitHub 页面上还看到旧内容，刷新页面或确认最新提交已经推送成功即可。
