# Server.js 架构说明

## 当前状态

生产环境以 **单文件** [`server.js`](./server.js) 为唯一入口，包含数据库、认证、路由与静态资源服务。

此前尝试拆分的 `routes/`、`middleware/`、`database/`、`utils/` 模块已移除，避免与线上逻辑漂移。新功能请直接维护 `server.js`，或在未来一次性完成模块化迁移后再切换入口。

## 推荐维护方式

- 业务路由：集中在 `server.js` 中按注释分区维护
- 配置：通过项目根目录 `.env` / `.env.example`
- 数据：`sql.js` + `server/data/studio.sqlite` + `server/uploads/`
- 部署：见 [`PROJECT_GUIDE.md`](../PROJECT_GUIDE.md)

## 若需再次模块化

1. 先补齐集成测试（登录、bootstrap、审片、借出状态机）
2. 抽出 `database`、`auth`、`routes` 后由 `setupRoutes(app)` 统一挂载
3. 删除 `server.js` 中的重复实现，而不是长期双轨并存
