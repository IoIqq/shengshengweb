# 声声网络思政工作室 - 开发规范

若历史文档、归档文档或旧报告与本文冲突，以本文为准。

## 1. 最高优先级规则

### 1.1 禁止非必要全局读取

- 每个小任务只读取该任务必要的具体文件。
- 禁止全局读取、全目录扫描、全仓库 grep 或一次性打开大量无关文件。
- 确需扩大范围时，先限定到具体模块并说明原因。

### 1.2 禁止修改旧单体文件

以下文件只作历史参考，不得修改：
- `server/server.js`
- `public/styles.css`

当前入口：后端 `server/server-new.js`，CSS `public/css/main.css`。

### 1.3 禁止绕过模块化结构

- 路由不直接写 SQL；持久化逻辑放 `server/models/`。
- 前端功能代码放 `public/js/`，不新增根级 `public/*.js` 功能脚本。
- 样式放入 `public/css/` 对应模块，不在 HTML 写非必要内联样式。

## 2. 后端规范

结构：`server/server-new.js`（入口） + `config/` + `middleware/` + `models/` + `routes/` + `utils/`

### 2.1 新增 API 流程

1. `server/models/` 新建或扩展模型，封装查询/写入/持久化。
2. `server/routes/` 新建或扩展路由，只处理 HTTP/认证/权限/校验/响应格式。
3. 新路由模块在 `server/server-new.js` 注册。
4. 更新 `docs/GUIDE.md` API 参考。

路由层**禁止**：直接导入 `run/get/all/transaction` 写 SQL、拼接 SQL、处理复杂业务状态。
路由层**可以**：读 params/query/body、校验与权限控制、调用模型层、返回统一响应。

### 2.2 权限中间件

- `requireAuth` — 要求登录
- `requireAdmin` — 要求管理员
- `requireEditor` — 要求编辑或管理员
- `csrfProtect` — 全局 CSRF 保护

写操作必须确认权限；敏感操作记录审计日志。

## 3. 前端规范

结构：`public/js/`（core/ modules/ ui/ utils/）+ `public/css/`（base/ layout/ components/ pages/ responsive/ utilities/）

### 3.1 JavaScript

- 业务模块 → `public/js/modules/`
- UI 能力 → `public/js/ui/`
- 状态/DOM/配置 → `public/js/core/`
- 请求/存储/辅助 → `public/js/utils/`
- 新增 DOM 引用 → `public/js/core/dom.js`
- HTTP 请求 → 复用 `utils/api.js` 的 `requestJSON()`

禁止：根级功能脚本、全局函数/inline onclick 绑定业务、JS 内联布局样式。

### 3.2 CSS

| 层级 | 用途 |
|------|------|
| `base/` | 变量、重置、排版、动画 |
| `layout/` | 工作区、导航、网格、面板 |
| `components/` | 按钮、表单、卡片、弹窗、表格 |
| `pages/` | 单页面/功能区专属样式 |
| `responsive/` | 断点和触摸设备 |
| `utilities/` | 工具类 |

新 CSS 文件在 `main.css` 导入。优先使用 `--spacing-*` 等设计令牌。

## 4. UI/UX 强制项

- 交互目标 ≥ 44px
- 图标按钮有 `aria-label` 或等效可访问名称
- 键盘焦点可见，不移除 `:focus-visible`
- 表单字段有可见 label，错误信息靠近字段
- 状态不只靠颜色表达
- 小屏无横向滚动
- 动效 150-300ms，尊重 `prefers-reduced-motion`
- 结构性图标用 SVG，不用 emoji 做导航/状态/控制图标

## 5. 配置与静态资源

- 配置从 `server/config/` 读取，不硬编码端口/路径/上传限制。
- Express 静态资源指向 `public/`，`/uploads` 受认证保护。
- Service Worker 缓存与当前文件结构一致。
- PM2 部署入口指向 `server/server-new.js`。

## 6. 提交前检查清单

- [ ] 按小任务执行，无非必要全局读取。
- [ ] 未修改 `server/server.js`、`public/styles.css`。
- [ ] 路由未新增直接 SQL；持久化逻辑在 `models/`。
- [ ] 新前端代码在 `public/js/` 对应模块；新样式在 `public/css/` 对应模块。
- [ ] 无新增 HTML 内联样式或 inline 事件。
- [ ] 触控目标、焦点、图标标签、表单标签满足 UI 强制项。
- [ ] API 或架构变化已更新 `docs/GUIDE.md`。
- [ ] 已运行与改动范围匹配的 lint/语法检查/手测。

## 7. 模块化状态

项目已完成模块化重构（后端单体 3,469→208 行，34 个 API 端点，10 个路由模块，9 个数据模型）。当前结构即规范。持续治理：遗留路由直接 SQL 迁移到模型层、清理内联样式和低于 44px 的控件。

---

**最后更新**：2026-06-13（精简：合并重复章节，移除冗长代码示例）