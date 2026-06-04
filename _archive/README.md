# 归档目录

> 这里存放**已经不再使用、但暂时不删的历史文件**。
> 给你一个安全网：万一发现某个旧文件还有用，从这里拿回去就行。
> 验证一段时间（建议 30 天）后一切正常，可以整目录删掉。

## 为什么要归档而不是直接删？

虽然 Git 历史里这些文件都还能找回，但归档让"找回"更直观——不用 `git log --all`、不用记 commit hash，直接来这个目录翻就行。

## 归档清单

| 归档路径 | 原位置 | 归档原因 |
|---|---|---|
| `app.js.backup` | 项目根 | 旧版前端整合代码，已被 `js/app-modular.js` 完全替代 |
| `app-modular-example.js` | `js/` | 模块化示例文件，仅供参考，不被任何地方引用 |
| `server/server.js.backup` | `server/` | 旧版后端代码，已被 `server/server.js` 完全替代 |
| `server/server-new.js` | `server/` | 重构未完成的副本，主程序没引用，也没在 `package.json` 里登记 |
| `server/config/` | `server/` | 给 `server-new.js` 准备的配置层，未启用 |
| `server/database/` | `server/` | 给 `server-new.js` 准备的数据层，未启用 |
| `server/middleware/` | `server/` | 给 `server-new.js` 准备的中间件层，未启用 |
| `server/routes/` | `server/` | 给 `server-new.js` 准备的路由层（`auth/borrow/device/media/system/team/todo/wish` 9 个文件），未启用 |
| `server/services/` | `server/` | 给 `server-new.js` 准备的服务层，未启用 |
| `server/utils/` | `server/` | 给 `server-new.js` 准备的工具层，未启用 |

## 主程序还在用什么？

正在运行的代码路径：

- 前端入口：`index.html` → `js/app-modular.js` → `js/{core,ui,utils,modules}/*.js`
- 后端入口：`server/server.js`（单文件 ~2900 行，所有路由都在里面）
- 工具脚本：`server/scripts/`（init-db / check-env / maintenance / show-network）

`_archive/` 里的代码**不被任何运行中的代码引用**，删除它们不会影响任何功能。

## 何时可以删除整个 `_archive/`？

满足以下条件即可放心 `rm -rf _archive`：

1. ✅ 项目已稳定运行 ≥ 30 天，没有出现需要"复活"旧文件的情况
2. ✅ Git 已经把所有改动 push 到 GitHub（`git push origin main` 之后才有真正的远程备份）
3. ✅ 团队所有成员都知情（如果有协作）

如果上面任意一条不满足，建议继续保留。

## 误恢复操作（万一需要）

```cmd
:: 把某个目录还原回去（举例：恢复 server/routes）
move _archive\server\routes server\routes

:: 把某个文件还原回去
move _archive\app.js.backup app.js.backup
```

---

归档时间：2026-06-02
