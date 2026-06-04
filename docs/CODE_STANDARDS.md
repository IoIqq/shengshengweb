# 声声网络思政工作室 - 开发规范

## 🚨 严格禁止事项 (CRITICAL)

### ❌ 绝对禁止修改的文件

以下文件已被弃用并归档，**任何情况下都不得修改**：

1. ~~`server/server.js`~~ → **已归档至 `_archive/server/server.js.monolithic-backup-20260604`**
   - 旧的3,469行单体服务器文件
   - ✅ **请使用** `server/server-new.js` (208行模块化入口)

2. ~~`public/styles.css`~~ → **即将归档至 `_archive/styles/` (CSS模块化完成后)**
   - 旧的7,923行单体样式文件
   - ✅ **请使用** `public/css/` 目录下的模块化CSS文件

**违规后果：**
- 所有修改将在代码审查时被拒绝
- 必须将修改迁移到对应的模块化文件
- 这些文件已从主代码库中移除，仅作历史备份

### ✅ 正确的开发流程

**添加新API端点：**
1. 在 `server/models/` 创建或扩展数据模型
2. 在 `server/routes/` 创建或扩展路由模块
3. 在 `server/server-new.js` 注册路由（如是新模块）

**添加新样式：**
1. 确定样式属于哪个层级（base/layout/components/pages/responsive/utilities）
2. 编辑对应的CSS模块文件
3. 如需新模块，在 `public/css/main.css` 添加导入

---

## 📁 静态资源管理规范

### 前端资源目录结构

所有前端静态资源**必须**放在 `public/` 目录下：

```
public/
├── css/                    # CSS模块（27个）
│   ├── main.css           # CSS入口文件
│   ├── base/              # 基础层
│   ├── layout/            # 布局层
│   ├── components/        # 组件层
│   ├── pages/             # 页面层
│   ├── responsive/        # 响应式层
│   └── utilities/         # 工具类
├── js/                    # JavaScript模块
├── assets/                # 图片、字体等
├── config.js              # 前端配置
└── index.html             # 主页面
```

### HTML资源引用规范

**CSS引用：**
```html
<!-- ✅ 正确：使用模块化CSS入口 -->
<link rel="stylesheet" href="css/main.css" />

<!-- ❌ 错误：引用已归档的单体文件 -->
<link rel="stylesheet" href="styles.css" />
```

**JavaScript引用：**
```html
<!-- ✅ 正确：相对于public目录的路径 -->
<script src="js/app-modular.js"></script>
<script src="config.js"></script>

<!-- ❌ 错误：使用绝对路径或错误路径 -->
<script src="/public/js/app-modular.js"></script>
```

### 服务器静态资源配置

**Express静态资源中间件必须指向 `public` 目录：**

```javascript
// ✅ 正确配置 (server/server-new.js)
app.use(
  express.static(path.join(config.ROOT_DIR, 'public'), {
    index: 'index.html',
    // ...
  })
);

// ❌ 错误：指向项目根目录
app.use(express.static(config.ROOT_DIR, { ... }));
```

**说明：**
- `config.ROOT_DIR` 是项目根目录
- 静态资源中间件应指向 `public` 子目录
- 这样 URL `/css/main.css` 才能正确映射到 `public/css/main.css`
- 必须设置 `index: 'index.html'` 以正确提供首页

### 常见问题

**问题1：手机端提示"未找到请求的资源"**

**原因：**
- HTML引用了已归档的 `styles.css`
- 或静态资源目录配置错误

**解决：**
1. 检查 `public/index.html` 中CSS引用是否为 `css/main.css`
2. 检查 `server/server-new.js` 静态中间件是否指向 `public` 目录
3. 重启服务器并清除浏览器缓存

**问题2：PC端正常但手机端异常**

**原因：** PC端浏览器缓存了旧版本资源

**解决：** 
- PC端清除缓存（Ctrl+Shift+Delete）
- 强制刷新（Ctrl+F5）
- 检查Network面板是否有404错误

**示例 - 添加新API端点：**
```javascript
// 步骤1: 在 server/models/feature.js 创建模型
const { all, run, saveDatabase } = require('./database');

function getAllFeatures() {
  return all('SELECT * FROM features ORDER BY created_at DESC');
}

function createFeature(data) {
  run('INSERT INTO features (id, name) VALUES (?, ?)', [data.id, data.name]);
  saveDatabase();
}

module.exports = { getAllFeatures, createFeature };

// 步骤2: 在 server/routes/feature.js 创建路由
const express = require('express');
const router = express.Router();
const { feature } = require('../models');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const features = feature.getAllFeatures();
  res.json({ ok: true, features });
});

module.exports = router;

// 步骤3: 在 server/server-new.js 注册路由
const featureRoutes = require('./routes/feature');
app.use('/api/features', featureRoutes);
```

---

## 🚨 强制性规范

### 1. 代码模块化规范（必须遵守）

**禁止向 `server/server.js` 写入冗余代码！**

项目已完成模块化重构，所有新代码必须按照以下结构组织：

```
server/
├── config/          # 配置文件
│   ├── index.js     # 主配置
│   └── permissions.js  # 权限配置
│
├── middleware/      # 中间件
│   ├── auth.js      # 认证中间件
│   ├── csrf.js      # CSRF保护
│   └── index.js     # 通用中间件
│
├── models/          # 数据模型（必须使用）
│   ├── database.js  # 数据库核心
│   ├── user.js      # 用户模型
│   ├── session.js   # 会话模型
│   ├── media.js     # 媒体模型
│   ├── todo.js      # 待办模型
│   ├── audit.js     # 审计模型
│   └── index.js     # 模型导出
│
├── routes/          # 路由模块（必须使用）
│   ├── auth.js      # 认证路由
│   ├── users.js     # 用户管理路由
│   ├── media.js     # 媒体路由（待添加）
│   ├── todos.js     # 待办路由（待添加）
│   └── ... 其他路由
│
├── utils/           # 工具函数
│   ├── index.js     # 通用工具
│   └── logger.js    # 日志工具
│
├── controllers/     # 业务逻辑（可选）
│
└── server-new.js    # 主服务器文件（精简版，192行）
```

### 2. 新功能开发流程

#### ❌ 错误做法（禁止）
```javascript
// 不要在 server.js 中直接写路由和业务逻辑
app.post('/api/some-feature', (req, res) => {
  // 100+ 行业务逻辑
  // 数据库操作
  // ...
});
```

#### ✅ 正确做法（必须）

**步骤 1: 在 models/ 创建数据模型**
```javascript
// server/models/feature.js
const { all, get, run, saveDatabase } = require('./database');

function getFeatureById(id) {
  return get('SELECT * FROM features WHERE id = ?', [id]);
}

module.exports = { getFeatureById };
```

**步骤 2: 在 routes/ 创建路由**
```javascript
// server/routes/feature.js
const express = require('express');
const router = express.Router();
const { feature: featureModel } = require('../models');
const { requireAuth } = require('../middleware/auth');

router.get('/:id', requireAuth, (req, res) => {
  const feature = featureModel.getFeatureById(req.params.id);
  res.json({ ok: true, feature });
});

module.exports = router;
```

**步骤 3: 在 server-new.js 注册路由**
```javascript
// server/server-new.js
const featureRoutes = require('./routes/feature');
app.use('/api/features', featureRoutes);
```

### 3. 数据库操作规范

**❌ 禁止直接操作数据库**
```javascript
// 不要在路由中直接写SQL
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  res.json(users);
});
```

**✅ 必须通过模型层**
```javascript
// 使用封装好的模型方法
const { user: userModel } = require('../models');
const users = userModel.getAllUsers();
```

### 4. 中间件使用规范

**已提供的中间件：**
- `requireAuth` - 要求用户登录
- `requireAdmin` - 要求管理员权限
- `requireEditor` - 要求编辑或管理员权限
- `requirePermission(permission)` - 要求特定权限
- `csrfProtect` - CSRF保护（自动应用）

**示例：**
```javascript
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  // 删除操作
});
```

### 5. 配置管理规范

**❌ 不要硬编码配置**
```javascript
const PORT = 3002;
const DB_PATH = './server/data/studio.sqlite';
```

**✅ 使用配置模块**
```javascript
const config = require('./config');
const PORT = config.PORT;
const DB_PATH = config.DB_PATH;
```

### 6. 日志记录规范

**使用统一的日志工具：**
```javascript
const { logServerEvent } = require('../utils/logger');

logServerEvent('info', 'feature_created', {
  featureId: newFeature.id,
  userId: req.user.id
});
```

### 7. 错误处理规范

**统一使用try-catch和错误中间件：**
```javascript
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const result = await someOperation();
    res.json({ ok: true, result });
  } catch (error) {
    next(error); // 传递给错误处理中间件
  }
});
```

## 📋 代码审查检查清单

在提交代码前，确保：

- [ ] 没有在 `server.js` 中添加新的路由或业务逻辑
- [ ] 数据库操作都通过 models/ 层完成
- [ ] 路由已正确拆分到 routes/ 目录
- [ ] 使用了正确的中间件进行权限控制
- [ ] 配置项从 config/ 读取，不硬编码
- [ ] 添加了适当的错误处理
- [ ] 记录了关键操作的日志
- [ ] 审计日志已记录（用户敏感操作）

## 🔧 重构进度

### 已完成 ✅
- [x] 配置模块化 (config/)
- [x] 工具函数提取 (utils/)
- [x] 中间件提取 (middleware/)
- [x] 数据库模型层 (models/)
- [x] 认证路由 (routes/auth.js)
- [x] 用户管理路由 (routes/users.js)
- [x] 新版服务器入口 (server-new.js - 192行)

### 待完成 ⏳
- [ ] 媒体管理路由 (routes/media.js)
- [ ] 待办事项路由 (routes/todos.js)
- [ ] 团队管理路由 (routes/team.js)
- [ ] 设备管理路由 (routes/devices.js)
- [ ] 借用申请路由 (routes/borrow.js)
- [ ] 留言墙路由 (routes/wishes.js)
- [ ] 审计日志路由 (routes/audit.js)
- [ ] 文件上传处理模块
- [ ] 完整迁移到 server-new.js

## 🎯 目标

通过模块化重构：
1. **提高可维护性** - 每个文件职责清晰
2. **提升代码质量** - 统一的代码风格和规范
3. **便于团队协作** - 模块独立，减少冲突
4. **简化测试** - 模块化便于单元测试
5. **降低复杂度** - 从3469行降至192行主文件

## ⚠️ 违规处理

如果发现代码违反上述规范：
1. 代码审查不通过
2. 要求重构成模块化结构
3. 记录到技术债务清单

---

## 🔒 安全性配置

### 登录速率限制

**配置文件：** `server/routes/auth.js`

**当前设置：**
- **时间窗口**: 1分钟（60秒）
- **最大尝试次数**: 5次
- **限流消息**: "登录尝试次数过多，请1分钟后再试。"

**实现代码：**
```javascript
const rateLimit = require('express-rate-limit');

// 登录限流：1分钟内最多5次尝试
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 5,
  message: { error: '登录尝试次数过多，请1分钟后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 应用到登录路由
router.post('/login', loginLimiter, (req, res) => {
  // 登录逻辑
});
```

**工作原理：**
1. 使用 `express-rate-limit` 中间件跟踪每个IP的请求
2. 在1分钟窗口内，同一IP最多允许5次登录尝试
3. 超过限制后，返回429 Too Many Requests状态码
4. 1分钟后计数器自动重置

**修改限流配置：**

如需调整限流参数，修改 `server/routes/auth.js` 中的 `loginLimiter` 配置：

```javascript
// 更严格：30秒3次
windowMs: 30 * 1000,
max: 3,

// 更宽松：5分钟10次
windowMs: 5 * 60 * 1000,
max: 10,
```

**安全建议：**
- ✅ 当前配置（1分钟5次）适合大多数场景
- ✅ 防止暴力破解攻击
- ✅ 不影响正常用户登录体验
- ⚠️ 修改前请评估业务影响

### 其他安全措施

项目已实施的安全措施：
- **Helmet.js**: HTTP安全头（HSTS, CSP等）
- **CSRF保护**: 基于HMAC的CSRF令牌
- **会话管理**: 安全的Cookie配置
- **审计日志**: 记录所有敏感操作
- **密码加密**: 使用bcrypt加密存储（如已实现）
- **权限控制**: 基于角色的访问控制（guest/editor/admin）

---

**记住：保持模块化，让代码更清晰！** 🚀
