# Server.js 重构文档

## 概述

原 `server.js` 文件包含 2881 行代码，所有功能都集中在一个文件中，难以维护和扩展。本次重构将代码拆分为模块化结构，提高了可维护性、可测试性和可扩展性。

## 重构目标

1. **提高可维护性**：每个模块职责单一，易于理解和修改
2. **提高可测试性**：独立模块便于单元测试
3. **提高可扩展性**：新增功能只需添加新模块
4. **保持兼容性**：API 接口保持不变，不影响现有功能

## 新的目录结构

```
server/
├── server.js                 # 原始文件（保持不变）
├── server.js.backup          # 原始文件备份
├── server-new.js             # 重构后的主入口（框架版）
├── REFACTORING.md            # 本文档
├── config/
│   └── index.js             # 配置管理（环境变量、路径、常量）
├── utils/
│   ├── helpers.js           # 通用工具函数
│   ├── crypto.js            # 加密相关工具
│   ├── validators.js        # 数据验证函数
│   └── logger.js            # 日志系统
├── database/
│   ├── index.js             # 数据库初始化和操作
│   └── seed.js              # 种子数据
├── middleware/
│   ├── auth.js              # 认证中间件
│   └── rateLimiter.js       # 限流配置
├── services/                # 业务逻辑层（待实现）
└── routes/                  # 路由层（待实现）
    └── index.js             # 路由汇总
```

## 模块说明

### 1. config/index.js
集中管理所有配置项：
- 路径配置（数据库、上传目录等）
- 服务器配置（端口、主机等）
- 会话配置
- 上传配置
- 站点配置
- 日志配置

### 2. utils/
工具函数模块：
- **helpers.js**: 日期格式化、ID生成、XML转义、SVG缩略图生成等
- **crypto.js**: 密码哈希、密码验证
- **validators.js**: 数据验证和规范化
- **logger.js**: 日志写入、轮转、清理

### 3. database/
数据库模块：
- **index.js**: 数据库连接、CRUD操作、事务管理、持久化
- **seed.js**: 种子数据、默认数据生成

### 4. middleware/
中间件模块：
- **auth.js**: 会话管理、CSRF防护、认证授权
- **rateLimiter.js**: 各种限流器配置

### 5. services/（待实现）
业务逻辑层，建议按功能拆分：
- media.js - 媒体管理
- device.js - 设备管理
- borrow.js - 借用管理
- team.js - 团队管理
- todo.js - 待办管理
- wish.js - 留言墙

### 6. routes/（待实现）
路由层，建议按功能拆分：
- auth.js - 认证路由
- media.js - 媒体路由
- device.js - 设备路由
- borrow.js - 借用路由
- team.js - 团队路由
- todo.js - 待办路由
- wish.js - 留言墙路由
- system.js - 系统路由

## 使用方法

### 当前状态

目前已完成基础架构的搭建：
- ✅ 配置模块
- ✅ 工具函数模块
- ✅ 数据库模块
- ✅ 中间件模块
- ⚠️ 路由模块（框架已建立，但路由代码仍在原server.js中）

### 继续使用原server.js

```bash
# 原server.js保持不变，可以继续使用
node server/server.js
```

### 测试重构框架

```bash
# 使用重构后的框架版本（注意：路由功能尚未完全迁移）
node server/server-new.js
```

## 下一步工作

为了完成完整的重构，建议按以下步骤进行：

### 1. 拆分路由模块（优先级：高）

将原 `server.js` 中的路由代码（约1500行）按功能拆分到 `routes/` 目录：

```javascript
// routes/auth.js 示例
const express = require('express');
const router = express.Router();
const { requireAuth, createSession, ... } = require('../middleware/auth');

router.post('/login', loginLimiter, (req, res) => {
  // 登录逻辑
});

router.post('/logout', (req, res) => {
  // 登出逻辑
});

module.exports = router;
```

### 2. 创建服务层（优先级：中）

将业务逻辑从路由中提取到服务层：

```javascript
// services/media.js 示例
const { all, get, runWrite, transaction } = require('../database');

function getAllMedia() {
  return all("SELECT * FROM media ORDER BY datetime(created_at) DESC")
    .map(mediaRowToItem);
}

function getMediaById(id) {
  return get("SELECT * FROM media WHERE id = ? LIMIT 1", [id]);
}

module.exports = {
  getAllMedia,
  getMediaById,
  // ...
};
```

### 3. 完善测试（优先级：中）

为各个模块编写单元测试：

```javascript
// tests/utils/helpers.test.js
const { nowIso, randomId } = require('../../utils/helpers');

describe('helpers', () => {
  test('nowIso returns ISO string', () => {
    const result = nowIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

### 4. 更新文档（优先级：低）

完善各模块的文档和注释。

## 迁移策略

建议采用渐进式迁移策略：

1. **保持原server.js运行**：在生产环境继续使用原文件
2. **逐步迁移路由**：每次迁移一个功能模块的路由
3. **充分测试**：每迁移一个模块后进行完整测试
4. **并行运行**：在测试环境同时运行新旧版本对比
5. **完全切换**：所有功能迁移并测试通过后，切换到新版本

## 优势对比

### 原架构（单文件）
- ❌ 2881行代码难以维护
- ❌ 所有功能耦合在一起
- ❌ 难以进行单元测试
- ❌ 多人协作容易冲突
- ❌ 代码复用困难

### 新架构（模块化）
- ✅ 每个模块职责单一，易于理解
- ✅ 模块间低耦合，高内聚
- ✅ 便于单元测试
- ✅ 多人可并行开发不同模块
- ✅ 工具函数和服务可复用

## 注意事项

1. **向后兼容**：所有API接口保持不变
2. **数据库兼容**：数据库结构和数据保持不变
3. **配置兼容**：环境变量和配置项保持不变
4. **渐进迁移**：不要一次性替换所有代码
5. **充分测试**：每次修改后都要进行完整测试

## 常见问题

### Q: 为什么不直接替换server.js？
A: 为了保证系统稳定性，采用渐进式迁移策略。原server.js作为备份，新版本经过充分测试后再替换。

### Q: 如何迁移路由代码？
A: 建议按功能模块逐个迁移，每迁移一个模块后进行测试，确保功能正常。

### Q: 性能会受影响吗？
A: 模块化不会影响性能，反而通过更好的代码组织可能提升性能。

### Q: 需要修改前端代码吗？
A: 不需要。API接口保持完全兼容，前端无需任何修改。

## 贡献指南

如果要继续完善重构：

1. 从 `routes/` 目录开始，创建各功能模块的路由文件
2. 将原 `server.js` 中对应的路由代码迁移过来
3. 在 `server-new.js` 中导入并使用新的路由模块
4. 测试确保功能正常
5. 重复以上步骤直到所有路由迁移完成

## 联系方式

如有问题或建议，请联系开发团队。

---

**重构日期**: 2026年6月1日  
**重构版本**: v1.0 (框架版)  
**状态**: 基础架构完成，路由迁移待完成
