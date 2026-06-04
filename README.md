# 声声网络思政工作室网站

> 轻量级工作室协作管理系统 - 素材管理、审核、待办、团队协作、设备借用

## ⚠️ 重要提示

**项目已完成模块化重构（2026-06-04 + UI优化 2026-06-04）**

- ❌ **禁止修改** ~~`server/server.js`~~ 和 ~~`public/styles.css`~~ （已归档）
- ✅ **使用** `server/server-new.js` 作为入口（208行 vs 旧版3,469行）
- ✅ **使用** `public/css/` 模块化CSS（27个模块 + 8px网格系统）
- 📖 **开发规范** [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)

---

## 🚀 快速开始

### Windows 一键启动

```bash
scripts/启动.bat
```

### 手动启动

```bash
npm install        # 安装依赖
npm run dev        # 开发模式
npm start          # 生产模式
```

### 手机访问

```bash
npm run network    # 显示局域网地址和二维码
```

**默认账号**
- 管理员: `admin` / `ShengSheng@2026`
- 访客: `guest` / `guest123`

---

## 📁 项目结构

```
shengsheng-ideology-studio-site/
├── server/                     # 后端（模块化）
│   ├── server-new.js           # 入口 208行
│   ├── config/                 # 配置层
│   ├── middleware/             # 中间件（认证/CSRF/日志）
│   ├── models/                 # 数据模型（9个）
│   ├── routes/                 # 路由模块（10个，34个API）
│   └── utils/                  # 工具函数
│
├── public/                     # 前端
│   ├── css/                    # 27个CSS模块
│   │   ├── base/               # 基础层（变量/重置/排版/动画）
│   │   ├── layout/             # 布局层（网格/工作区/面板/导航）
│   │   ├── components/         # 组件层（按钮/表单/卡片/模态框等）
│   │   ├── pages/              # 页面层
│   │   ├── responsive/         # 响应式（平板/手机/触摸）
│   │   └── utilities/          # 工具类
│   ├── js/                     # JavaScript模块
│   └── index.html
│
├── docs/                       # 文档
│   ├── CODE_STANDARDS.md       # 开发规范 ⚠️必读
│   └── GUIDE.md                # 完整开发指南
│
└── _archive/                   # 归档代码（历史参考）
```

---

## 🛠️ 技术栈

**前端**
- HTML5/CSS3 模块化架构（27个CSS模块）
- JavaScript ES6+ 模块化
- 8px基础网格系统 + clamp()流体响应式
- Service Worker 离线支持

**后端**
- Node.js >= 18 + Express
- SQLite（sql.js）数据库
- 模块化架构（27个模块，208行入口）
- 登录限流（1分钟5次）+ CSRF防护

---

## 📱 响应式设计

- ✅ **360px** - 超小屏手机（间距优化+150%）
- ✅ **480px** - 小屏手机
- ✅ **640px** - 标准手机
- ✅ **768px** - 大屏手机/小平板
- ✅ **900px** - iPad竖屏
- ✅ **1200px+** - 桌面端

触摸目标 ≥ 44px，符合WCAG标准

---

## 📚 文档导航

- **[开发指南](docs/GUIDE.md)** - 架构、部署、API文档
- **[开发规范](docs/CODE_STANDARDS.md)** - 模块化规范 ⚠️必读
- **[重构报告](REFACTORING_SUMMARY.md)** - 模块化重构详情
- **[UI优化报告](UI_OPTIMIZATION_P2_COMPLETE.md)** - 间距系统优化

---

## ⚡ 核心功能

- 🖼️ **素材库** - 图片/视频管理、批量上传
- ✅ **审片中心** - 素材审核、通过/拒绝
- 📋 **待办事项** - 任务管理、状态跟踪
- 👥 **团队协作** - 成员管理、在线状态
- 🔧 **设备管理** - 库存管理、借用申请
- ⚙️ **系统设置** - 配置管理、用户管理
- 💬 **留言墙** - 匿名/实名留言

---

## 🔐 安全特性

- PBKDF2密码加密（100,000轮迭代）
- 登录速率限制（1分钟5次）
- CSRF令牌保护
- Helmet安全头
- 审计日志（90天自动清理）
- 角色权限控制（admin/editor/guest）

---

## 📄 许可证

MIT License

---

## 🙋 获取帮助

- 开发问题：查看 [docs/GUIDE.md](docs/GUIDE.md)
- 规范问题：查看 [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)
- 部署问题：查看 GUIDE.md 部署章节
