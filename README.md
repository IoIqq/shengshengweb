# shengshengweb

这是一个面向工作室日常协作的轻量级站点，提供素材管理、审片、待办、团队和设备借出等能力。后端基于 `Node.js + Express`，数据使用 `SQLite` 本地落盘，图片和视频直接保存在服务器磁盘上。

## 功能

- 素材库：浏览、筛选和搜索图片与视频
- 审片中心：通过、退回、备注
- 待办事项：新增、完成、删除
- 服务器照片同步：自动扫描 `server/uploads/inbox`
- 管理员登录：保护写操作
- 运行状态：展示同步状态、登录状态和基础运行信息

## 快速开始

### 🚀 一键部署（推荐）

**Windows**：
```cmd
setup.bat
```

**Linux/Mac**：
```bash
chmod +x setup.sh && ./setup.sh
```

脚本会自动完成：
- ✅ 检查环境
- ✅ 安装依赖
- ✅ 配置环境变量
- ✅ 创建目录
- ✅ 初始化数据库

### 📝 手动部署

1. 安装依赖
   ```bash
   npm install
   ```

2. 配置环境变量
   ```bash
   copy .env.example .env  # Windows
   cp .env.example .env    # Linux/Mac
   ```

3. 启动项目
   ```bash
   npm run dev
   ```

4. 访问网站
   - 本地：http://localhost:3002
   - 局域网：http://你的IP:3002

## 📚 文档导航

| 文档 | 用途 |
|------|------|
| [README.md](README.md) | 项目入口（本文档） |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 部署与迁移指南 |
| [MAINTENANCE.md](MAINTENANCE.md) | 维护手册（含 ESLint、故障排查） |
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | 项目架构指南 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |

## 数据目录

- 数据库：`server/data/studio.sqlite`
- 上传图片：`server/uploads/media`
- 服务端收件箱：`server/uploads/inbox`

## 默认账号

项目的管理员账号由 `.env` 里的这两个变量控制：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

⚠️ **上线前请务必修改默认密码**

## 维护命令

```bash
npm run maintenance   # 运行完整维护
npm run lint          # 代码检查
npm run lint:fix      # 自动修复
```

详见 [MAINTENANCE.md](MAINTENANCE.md)

## 遇到问题？

- **部署问题** → [DEPLOYMENT.md](DEPLOYMENT.md)
- **使用问题** → [MAINTENANCE.md](MAINTENANCE.md)
- **开发问题** → [PROJECT_GUIDE.md](PROJECT_GUIDE.md)
