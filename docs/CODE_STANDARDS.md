# 声声网络思政工作室 - 开发规范

本文件是当前项目开发的强制规范。若历史文档、归档文档或旧报告与本文冲突，以本文为准。

## 1. 最高优先级规则

### 1.1 禁止非必要全局读取

开发、排查和修改必须按模块拆成小任务执行：

- 每个小任务只读取该任务必要的具体文件。
- 禁止为了“保险”而全局读取、全目录扫描、全仓库 grep 或一次性打开大量无关文件。
- 如确需扩大读取范围，必须先把范围限制到具体模块或具体文件，并说明原因。
- 修改前先确认当前小任务的文件边界；修改后只对受影响文件做必要验证。

### 1.2 禁止修改旧单体文件

以下旧单体文件只作历史参考，不得修改：

- `server/server.js`
- `public/styles.css`

当前入口与样式入口：

- 后端：`server/server-new.js`
- CSS：`public/css/main.css`

### 1.3 禁止绕过模块化结构

- 不在路由中直接写 SQL；SQL 与持久化逻辑必须放在 `server/models/`。
- 不新增根级 `public/*.js` 功能脚本；前端功能代码必须放在 `public/js/`。
- 不在 `public/index.html` 写非必要内联样式；样式放入 `public/css/` 对应模块。
- Service Worker 缓存列表必须指向当前模块化入口，不能缓存旧 `styles.css` 或旧单体入口。

## 2. 后端模块化规范

当前后端按以下结构组织：

```text
server/
├── server-new.js       # 当前服务入口，只负责装配中间件、静态资源和路由
├── config/             # 配置
├── middleware/         # 认证、CSRF、通用中间件
├── models/             # 数据模型与持久化
├── routes/             # HTTP 路由
└── utils/              # 工具函数
```

当前模型集中导出于 `server/models/index.js`：

- `database`
- `user`
- `session`
- `media`
- `todo`
- `audit`
- `device`
- `borrow`
- `team`
- `profile`

### 2.1 新增 API 的流程

1. 在 `server/models/` 新建或扩展模型，封装查询、写入、删除和持久化。
2. 在 `server/routes/` 新建或扩展路由，只处理 HTTP、认证、权限、参数校验和响应格式。
3. 如果是新路由模块，在 `server/server-new.js` 注册。
4. 更新 `docs/GUIDE.md` 的 API 参考。

示例：

```javascript
// server/models/feature.js
const { all } = require('./database');

function getFeatures() {
  return all('SELECT * FROM features ORDER BY created_at DESC');
}

module.exports = { getFeatures };
```

```javascript
// server/routes/feature.js
const express = require('express');
const router = express.Router();
const { feature: featureModel } = require('../models');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  res.json({ ok: true, items: featureModel.getFeatures() });
});

module.exports = router;
```

```javascript
// server/server-new.js
const featureRoutes = require('./routes/feature');
app.use('/api/features', featureRoutes);
```

### 2.2 路由层禁止事项

路由模块不得：

- 直接导入 `run/get/all/transaction/saveDatabase` 写业务 SQL。
- 拼接 SQL 或直接操作表。
- 承担复杂业务状态转换。
- 处理与 HTTP 无关的持久化细节。

路由模块可以：

- 读取 `req.params`、`req.query`、`req.body`。
- 做输入校验与权限控制。
- 调用模型层函数。
- 返回统一响应。

### 2.3 权限与安全

常用中间件：

- `requireAuth`：要求登录。
- `requireAdmin`：要求管理员。
- `requireEditor`：要求编辑或管理员。
- `requireAuthForUploads`：保护上传文件访问。
- `csrfProtect`：全局 CSRF 保护。

写操作必须确认权限；敏感操作必须记录审计日志或活动日志。日志持久化也应由模型层封装。

## 3. 前端模块化规范

当前前端按以下结构组织：

```text
public/
├── index.html
├── config.js
├── service-worker.js
├── css/
│   ├── main.css
│   ├── base/
│   ├── layout/
│   ├── components/
│   ├── pages/
│   ├── responsive/
│   └── utilities/
└── js/
    ├── app-modular.js
    ├── core/
    ├── modules/
    ├── ui/
    └── utils/
```

### 3.1 JavaScript

- 页面业务模块放在 `public/js/modules/`。
- UI 基础能力放在 `public/js/ui/`。
- 状态、DOM、配置放在 `public/js/core/`。
- 请求、存储、辅助函数放在 `public/js/utils/`。
- 新增 DOM 引用先集中到 `public/js/core/dom.js`，再在业务模块使用。
- HTTP JSON 请求优先复用 `public/js/utils/api.js` 的 `requestJSON()`。
- 文件上传可按现有 XHR + CSRF 模式实现，但必须放在对应业务模块中。

禁止：

- 新增根级 `public/*.js` 功能脚本。
- 使用全局函数和 inline `onclick` 绑定业务行为。
- 在 JS 中写可用 CSS 类表达的布局/视觉内联样式。

### 3.2 CSS

CSS 必须写入对应层级模块：

| 层级 | 用途 |
| --- | --- |
| `base/` | 变量、重置、排版、动画基础。 |
| `layout/` | 工作区、导航、网格、面板等布局。 |
| `components/` | 按钮、表单、卡片、弹窗、表格等通用组件。 |
| `pages/` | 单页面或功能区专属样式。 |
| `responsive/` | 断点和触摸设备覆盖。 |
| `utilities/` | 工具类。 |

规则：

- 新 CSS 文件必须在 `public/css/main.css` 中导入。
- 间距优先使用 `--spacing-*` 令牌。
- 颜色、圆角、阴影、动效优先使用现有设计令牌。
- 不把页面样式塞进组件模块，也不把组件通用样式散落到页面模块。
- 不写不归属任何模块的“杂项 CSS”。

## 4. UI/UX 强制项

UI 改动必须满足以下最低要求：

- 交互目标尺寸不低于 44px。
- 图标按钮必须有可访问名称：可见文字、`aria-label` 或等效语义。
- 键盘焦点必须可见，不能移除 `:focus-visible`。
- 表单字段必须有可见 label，错误信息应靠近对应字段。
- 状态不能只靠颜色表达，应配合文字、图形或语义。
- 小屏不应产生页面级横向滚动。
- 动效应控制在 150-300ms，并尊重 `prefers-reduced-motion`。
- 结构性图标使用统一 SVG/文本策略，不使用 emoji 作为导航、状态或系统控制图标。

## 5. 配置与静态资源

- 配置从 `server/config/` 读取，不硬编码端口、路径、上传限制等运行配置。
- Express 静态资源必须指向 `public/`。
- `/uploads` 必须受认证保护。
- Service Worker 缓存条目必须与当前文件结构一致。
- PM2 等部署入口必须指向 `server/server-new.js`。

## 6. 提交前检查清单

提交前确认：

- [ ] 本次工作按小任务执行，没有非必要全局读取或扫描。
- [ ] 未修改 `server/server.js`、`public/styles.css`。
- [ ] 路由未新增直接 SQL。
- [ ] 新后端持久化逻辑已放入 `server/models/`。
- [ ] 新前端功能代码位于 `public/js/` 对应模块。
- [ ] 新样式位于 `public/css/` 对应模块，并使用设计令牌。
- [ ] 没有新增 HTML 内联样式或 inline 事件处理。
- [ ] 触控目标、焦点、图标标签、表单标签满足 UI 强制项。
- [ ] API 或架构变化已更新 `docs/GUIDE.md`。
- [ ] 运行了与本次改动范围匹配的 lint、语法检查或手测。

## 7. 当前模块化状态

已完成并作为当前结构维护：

- 配置模块：`server/config/`
- 中间件模块：`server/middleware/`
- 模型层：`server/models/`
- 路由层：`server/routes/`
- 当前入口：`server/server-new.js`
- 前端模块：`public/js/`
- CSS 模块：`public/css/`

仍需持续治理的方向：

- 将历史遗留的路由直接 SQL 逐步迁移到模型层。
- 将根级前端功能脚本迁入 `public/js/`。
- 清理内联样式、重复 CSS 和低于 44px 的交互控件。

---

**最后更新**：2026-06-05
