# 项目文件夹重组方案

## 目标
更清晰的文件组织结构，便于维护和理解项目。

## 新结构

```
shengsheng-ideology-studio-site/
├── 📁 docs/                    # 所有文档
│   ├── README.md               # 项目说明
│   ├── DEPLOYMENT.md           # 部署指南
│   ├── MAINTENANCE.md          # 维护手册
│   ├── PROJECT_GUIDE.md        # 项目架构指南
│   └── CHANGELOG.md            # 更新日志
│
├── 📁 scripts/                 # 所有脚本
│   ├── 启动.bat                # Windows 启动脚本
│   ├── setup.bat               # Windows 安装脚本
│   ├── setup.sh                # Unix 安装脚本
│   └── open-firewall.bat       # 防火墙配置脚本
│
├── 📁 public/                  # 前端静态文件
│   ├── index.html              # 主页面
│   ├── styles.css              # 主样式
│   ├── config.js               # 前端配置
│   ├── favicon.svg             # 网站图标
│   ├── service-worker.js       # Service Worker
│   ├── wish-wall.js            # 留言墙
│   ├── mobile-nav.js           # 移动导航
│   ├── 📁 js/                  # JavaScript 模块
│   └── 📁 assets/              # 静态资源
│
├── 📁 server/                  # 后端代码（保持不变）
│   ├── server.js
│   ├── data/
│   ├── logs/
│   ├── scripts/
│   └── uploads/
│
├── 📁 _archive/                # 归档文件（保持不变）
│
└── 配置文件（根目录）
    ├── package.json
    ├── .env.example
    ├── .gitignore
    ├── ecosystem.config.js
    ├── eslint.config.js
    └── .editorconfig
```

## 移动清单

### 文档 → docs/
- [x] README.md
- [x] DEPLOYMENT.md
- [x] MAINTENANCE.md
- [x] PROJECT_GUIDE.md
- [x] CHANGELOG.md

### 脚本 → scripts/
- [x] 启动.bat
- [x] setup.bat
- [x] setup.sh
- [x] open-firewall.bat

### 前端 → public/
- [x] index.html
- [x] styles.css
- [x] config.js
- [x] favicon.svg
- [x] service-worker.js
- [x] wish-wall.js
- [x] mobile-nav.js
- [x] js/ (整个目录)
- [x] assets/ (整个目录)

## 需要更新的引用

### 1. package.json
- 更新 main 入口
- 更新 scripts 中的路径

### 2. server/server.js
- 更新静态文件服务路径：从 `.` 改为 `../public`

### 3. 启动脚本
- 更新相对路径引用

### 4. index.html
- 所有资源引用保持相对路径（无需改动）

## 优点
1. ✅ 清晰的文件分类
2. ✅ 便于新手理解项目结构
3. ✅ 文档集中管理
4. ✅ 脚本文件单独存放
5. ✅ 前后端文件分离

## 注意事项
- 所有移动操作通过 Git 完成（保留历史）
- 移动后运行完整测试
- 更新 README.md 中的文件路径说明
