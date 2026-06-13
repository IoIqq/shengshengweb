# 声声网络思政工作室网站

> **⚠️ 开发者必读：开发前先阅读 [CODE_STANDARDS.md](docs/CODE_STANDARDS.md) 和 [GUIDE.md](docs/GUIDE.md)。**

轻量级工作室协作管理系统，覆盖素材管理、审片、待办、团队协作、设备登记与借用、系统设置等场景。

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发模式（nodemon 热重载）
npm start          # 生产模式
npm run network    # 显示局域网访问地址 + 二维码
```

## 项目结构

```text
server/                 # 后端（Express + sql.js）
  server-new.js         # ✅ 当前入口
  config/ middleware/ models/ routes/ utils/ scripts/
public/                 # 前端（原生 ES Modules + 模块化 CSS）
  index.html            # 主页面
  css/  (base/ layout/ components/ pages/ responsive/ utilities/)
  js/   (core/ modules/ ui/ utils/)
docs/                   # 开发文档
```

## 功能模块

- 📁 素材库 — 图片/视频上传、分类、标签、搜索
- ✅ 审片中心 — 素材审核（pending/approved/rejected）
- 📝 待办事项 — 个人与团队任务管理
- 👥 团队管理 — 成员信息、角色权限、贡献统计
- 🖥️ 设备登记 — 设备清单、借用审批
- 🎨 展示页 — 公开素材展示
- ⚙️ 系统设置 — 站点配置、存储管理

## 权限角色

| 角色 | 权限 |
|------|------|
| admin | 全部功能、用户管理、系统设置、备份 |
| editor | 上传、审核、管理内容，无系统设置 |
| guest | 只读查看 |

## 常用命令

```bash
npm run dev / start          # 开发/生产
npm run network              # 局域网访问二维码
npm run lint / lint:fix      # ESLint
npm run format / format:check # Prettier
npm run maintenance          # 日志清理与数据维护
npm run pm2:start / reload / stop  # PM2 进程管理
```

## 技术栈

- **后端**: Node.js ≥18, Express 4, sql.js (SQLite), Helmet, CSRF, Rate Limiting
- **前端**: 原生 HTML/CSS/JS ES Modules，无构建工具，CSS Variables + Grid
- **部署**: PM2（生产），nodemon（开发）
- **安全**: Session 认证 + RBAC + CSRF + 审计日志

---

详见 [GUIDE.md](docs/GUIDE.md)（架构/部署/API）和 [CODE_STANDARDS.md](docs/CODE_STANDARDS.md)（开发规范）。