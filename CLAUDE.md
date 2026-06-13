# 声声网络思政工作室 — AI 开发指令

## 项目定位

Node.js + Express + 原生 HTML/CSS/ES Modules 的轻量级工作室管理系统。
覆盖素材库、审片、待办、团队协作、设备管理、系统设置、留言墙等场景。

## 启动时必须执行

1. **加载 CodeGraph 索引** — 使用 `codegraph_explore` 了解代码结构，避免盲目扫描
2. **读取 docs/INDEX.md** — 了解文档布局
3. **读取 docs/CODE_STANDARDS.md** — 加载开发强制规范
4. **必要时读取 docs/GUIDE.md** — 了解架构和 API

## 优先使用的插件

按优先级排列：
1. **grill-me** — 重大决策前逐层确认，消除歧义
2. **codegraph-context** — 代码智能索引，替代全局 grep/扫描
3. **design-taste-frontend / ui-ux-pro-max** — UI/UX 设计和视觉审查

## 核心入口

| 层级 | 入口文件 | 说明 |
|------|---------|------|
| 后端入口 | `server/server-new.js` | 当前活跃入口 |
| 前端入口 | `public/index.html` | 主页面 |
| CSS 入口 | `public/css/main.css` | 样式入口 |
| 前端 JS | `public/js/app-modular.js` | 模块化 JS 入口 |

## 强制约束

- ⛔ **禁止修改旧单体文件**: `server/server.js`、`public/styles.css`
- ⛔ **禁止全局扫描**: 按模块小范围读取，用 CodeGraph 代替 grep
- ⛔ **禁止绕过模块化结构**: 路由不直接写 SQL，持久化逻辑放 `server/models/`
- ✅ **已排除目录**: `server/logs/`、`server/uploads/`、`node_modules/`、`.audit/`（见 `.claude/settings.json` deny 规则）

## 文档布局

所有文档在 `docs/` 目录，入口为 `docs/INDEX.md`。
开发前读取 `docs/CODE_STANDARDS.md`，架构/API 问题查阅 `docs/GUIDE.md`。