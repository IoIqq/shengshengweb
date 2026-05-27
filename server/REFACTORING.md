# Server.js 模块化重构说明

## 重构概述

将原本超过 1000 行的 `server.js` 进行部分模块化重构，提取核心功能到独立模块，提高代码可维护性。

## 新增模块结构

```
server/
├── server.js              # 主入口（保留数据库操作和大部分路由）
├── database/
│   └── db.js             # 数据库操作封装
├── middleware/
│   └── auth.js           # 认证中间件
├── routes/
│   ├── index.js          # 路由汇总
│   ├── auth.js           # 登录/登出路由
│   └── wish.js           # 留言墙路由（新功能）
└── utils/
    ├── logger.js         # 日志系统
    └── helpers.js        # 通用工具函数
```

## 模块说明

### 1. database/db.js
- 封装所有数据库操作函数
- 提供统一的数据库访问接口
- 包含：`get`, `all`, `runWrite`, `transaction`, `persistDb` 等

### 2. middleware/auth.js
- 认证和会话管理
- 包含：`requireAuth`, `requireAdmin`, `createSession`, `destroySession` 等
- 密码哈希和验证

### 3. utils/logger.js
- 统一的日志记录系统
- 包含：`logServerEvent`, `logRequest`, `logAuthFailure` 等
- 自动按日期分割日志文件

### 4. utils/helpers.js
- 通用工具函数
- 包含：`randomId`, `nowIso`, `createThumb`, `safeParse` 等
- 数据验证和转换函数

### 5. routes/auth.js
- 登录、登出、会话管理路由
- 包含登录限流保护

### 6. routes/wish.js（新功能）
- 留言墙功能路由
- 支持创建、查询、删除留言
- 支持匿名留言

## 新功能：留言墙

### 数据库表结构
```sql
CREATE TABLE wishes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  mood TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

### API 端点
- `GET /api/wishes` - 获取所有留言（需要登录）
- `POST /api/wishes` - 创建新留言（需要登录）
- `DELETE /api/wishes/:id` - 删除留言（管理员或作者）

### 功能特性
- 所有登录用户可以查看和发布留言
- 支持匿名发布（显示"匿名"而非用户名）
- 支持心情标签
- 留言内容限制 200 字
- 管理员可删除任何留言
- 非匿名用户可删除自己的留言

## 使用方式

### 在 server.js 中引入模块

```javascript
// 引入数据库模块
const db = require("./database/db");

// 引入工具函数
const { logServerEvent, logRequest } = require("./utils/logger");
const { randomId, nowIso } = require("./utils/helpers");

// 引入中间件
const { requireAuth, requireAdmin } = require("./middleware/auth");

// 引入路由
const { setupRoutes } = require("./routes");

// 初始化数据库
const SQL = await initSqlJs(...);
const dbInstance = db.loadFromDisk(SQL);
db.setDb(dbInstance);

// 设置路由
setupRoutes(app);
```

## 保留在 server.js 中的功能

为避免过度重构，以下功能仍保留在 `server.js` 中：
- 数据库初始化和表结构定义
- 数据转换函数（`mediaRowToItem`, `deviceRowToItem` 等）
- 大部分业务路由（media, devices, borrow-requests, todos, team, settings）
- 文件上传配置
- 错误处理中间件
- 服务器启动逻辑

## 优势

1. **可维护性提升**：核心功能模块化，职责清晰
2. **代码复用**：工具函数和中间件可在多处使用
3. **易于扩展**：新增功能只需添加新路由模块
4. **便于测试**：独立模块便于单元测试
5. **团队协作**：不同开发者可并行开发不同模块

## 后续优化建议

1. 继续拆分其他路由到独立文件
2. 提取数据转换函数到 models 层
3. 添加单元测试
4. 使用 TypeScript 增强类型安全

## 注意事项

- 所有模块都使用 CommonJS 格式（`require`/`module.exports`）
- 数据库模块使用单例模式，确保全局唯一实例
- 认证中间件依赖数据库模块
- 路由模块需要在数据库初始化后才能正常工作
