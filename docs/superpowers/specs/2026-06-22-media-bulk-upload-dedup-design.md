# 素材库批量上传 + 自动归档 + 查重 — 设计文档

- 日期：2026-06-22
- 状态：已通过设计评审，待写实现计划
- 范围：素材库（media）上传管线与查重子系统

## 1. 背景与目标

当前素材库上传为单次多文件请求（multer `array('files', MAX_UPLOAD_FILES)`，默认上限 30），文件以扁平命名 `upload-{timestamp}-{random}{ext}` 落入 `MEDIA_DIR`，无目录归档、无内容查重。

用户希望：

1. **大批量上传**：Explorer 式无感拖拽，无可见数量上限。
2. **自动归档**：按约定目录结构自动建文件夹并归类。
3. **查重**：基于内容哈希的重复检测，不阻塞上传，事后清理。
4. **存储解耦**：素材存于已配置（可外部/网络）的存储地址，工作台只是该存储的管理者。

## 2. 存储与目录模型

- 文件存于已配置的 `MEDIA_DIR = UPLOAD_DIR/media`。`UPLOAD_DIR` 已支持环境变量或 `server/data/storage-config.json` 指向外部/网络地址，无需新增配置机制。
- 目录约定：

  ```
  media/{年}/{YYYYMMDD活动名}/{设备名}/{文件}
  ```

  - 例：`media/2026/20260622物流运动会/SonyA7M4/IMG_001.jpg`
  - 年：从日期派生（取 `YYYYMMDD` 前 4 位）。
  - 活动名：用户在上传对话框输入。
  - 设备名：从现有 `devices` 表下拉选择（复用，不新增数据）。
  - 文件夹/文件名做非法字符清洗（移除 `\/:*?"<>|` 及首尾空白/点号）。
- 静态资源已从 `UPLOAD_DIR` 整树提供（`/uploads` 受认证保护），嵌套路径直接可用；`url` 按段 URL-encode 中文路径段。无需修改静态路由。

## 3. 上传流程（分阶段 + 后台传输）

四步：选择目标 → 拖入文件 → 暂存 → 后台传输。

1. 上传对话框新增：**目标文件夹选择（已有 / 新建）+ 设备下拉**。
   - 已有：扫描 `MEDIA_DIR` 下的 `年/活动` 两层目录，列表选择。
   - 新建：输入日期（默认今天）+ 活动名 → 预览生成 `YYYYMMDD活动名`，置于对应年目录下。
2. 拖入任意数量文件（Explorer 式、无可见数量上限；支持多选文件拖拽）。
3. 点"开始上传"：前端**并发小批**上传到本地暂存区 `UPLOAD_DIR/.staging/<jobId>/`。
   - 默认 4 路并发，每批 ~20 个文件。
   - 实时进度（总体 + 单文件）+ 单文件失败重试。
4. 全部暂存后，后端**自动建目标目录**，后台把暂存文件传到目标路径：
   - 自动分派存储类型——UNC 路径（`\\host\share` 前缀）用 `robocopy`（自动重试、断点、网络鲁棒）；其余（含本机路径与盘符映射如 `Z:\`）用 Node `fs` 流式拷贝。映射网络盘按本地处理，仍可正常拷贝，仅失去 robocopy 的断点重试优势。
   - 传输完成后更新 DB 记录为 `transfer_state = ready`。
   - 暂存文件传输成功后删除。
   - **记录生命周期**：媒体记录在暂存阶段即写入（`transfer_state = staging`），随传输推进更新为 `transferring` → `ready`/`failed`，保证重启可恢复。

### 上传限制策略

- UX 无数量上限。
- 后端每请求文件上限可配（默认 20，仅保护单请求，前端循环分批规避）。
- 单文件大小上限保留可配（`MAX_UPLOAD_MB`，默认调高至 2048），防误传超大文件；可通过环境变量继续调高或视作软限制。

## 4. 数据模型

走现有 `migrateSchema` 增量机制（`SCHEMA_MIGRATIONS`）。`media` 表新增列：

| 列 | 类型 | 说明 |
|----|------|------|
| `file_hash` | TEXT | SHA-256（十六进制），惰性计算，可空 |
| `transfer_state` | TEXT DEFAULT `'ready'` | `staging` / `transferring` / `ready` / `failed` |
| `original_filename` | TEXT | 原始上传文件名，便于展示与查重报告 |

`source_path` 由 `media/upload-xxx.ext` 变为 `media/2026/.../IMG_001.jpg`；`url` 同步。旧记录保持不变（向后兼容）。

### 传输任务状态

- 进程内维护传输进度（`jobId → { total, done, failed, files[] }`），供前端轮询/SSE 展示进度。
- **重启恢复**：服务启动时扫描暂存区与 `transfer_state ∈ {staging, transferring}` 的 DB 记录，幂等重传（目标已存在且大小一致则跳过并置 `ready`，否则重传）。
- 失败：`transfer_state = failed`，前端提供"重试"按钮。

## 5. 查重子系统

- **哈希算法**：Node `crypto.createHash('sha256')` 流式分块读取（不整文件入内存），全库范围。
- **两条触发**：
  1. **后台空闲渐进**：复用 inbox 自动扫描的定时机制（`AUTO_SCAN_SECONDS`），空闲时为 `file_hash IS NULL` 的素材逐步计算哈希，写入 DB。
  2. **手动"查重"按钮**：强制对未哈希素材计算哈希并出重复报告。
- **UI 组件**（素材库页内，与手动查重控件并列）：
  - "查重"按钮 + 进度（计算中 N/M）。
  - 重复分组列表：同 `file_hash` 的素材归为一组，标注各自所在文件夹，按组展示。
  - 操作：组内"保留某个 / 删除其余"；删除走 admin 权限 + 审计日志（复用现有删除流程与文件清理）。
- 上传**不因哈希阻塞**，全部入库；查重为事后清理。

## 6. 前端组件

遵循 CODE_STANDARDS 前端规范（`public/js/` + `public/css/`）。

- `public/js/modules/media.js`：重写上传对话框——目标选择（已有/新建）、设备下拉、拖拽入队、并发分批、实时进度、单文件重试、传输态徽标。
- 新增查重组件视图：重复分组渲染 + 保留/删除操作。
- DOM 引用补到 `public/js/core/dom.js`；HTTP 请求复用 `public/js/utils/api.js` 的 `requestJSON()`。
- 样式入 `public/css/` 对应模块并在 `main.css` 导入；使用设计令牌（`--spacing-*` 等）。
- 素材卡片展示传输态徽标（传输中 / 已完成 / 失败）；触控目标 ≥ 44px，键盘焦点可见，图标按钮有 `aria-label`。

## 7. 后端模块（遵循 CODE_STANDARDS）

路由不直接写 SQL，持久化在 `models/`。

- `server/models/media.js`：扩展
  - 目标路径生成（年/活动/设备，含清洗与重名处理）。
  - 暂存/传输状态读写。
  - 流式哈希计算 + 查重分组查询（按 `file_hash` 聚合）。
- `server/models/transfer.js`（新增）：
  - 暂存区管理（创建/清理/孤儿扫描）。
  - 后台传输分派：UNC 路径（`\\` 前缀）→ `robocopy` 子进程；其余（本机/盘符映射）→ Node `fs` 流式拷贝。
  - 重启恢复扫描。
- `server/routes/media.js`：扩展/新增端点
  - `POST /api/media/upload`（staged，接收目标信息 + 文件，返回 jobId）。
  - `GET /api/media/transfer/:jobId`（传输进度）。
  - `POST /api/media/transfer/:jobId/retry`。
  - `POST /api/media/dedup/scan`（触发查重）。
  - `GET /api/media/dedup/groups`（重复分组）。
  - `DELETE /api/media/:id`（已有，复用清理；查重删除走此）。
  - 移除 multer 文件数硬上限（改由每请求可配上限 + 前端分批）。
- `server/config`：新增 `STAGING_DIR`（默认 `UPLOAD_DIR/.staging`）、`TRANSFER_CONCURRENCY`（默认 4）、`UPLOAD_BATCH_SIZE`（默认 20）；`MAX_UPLOAD_FILES` 弃用为每请求软上限。
- 新路由模块在 `server/server-new.js` 注册（如 transfer 独立路由）。
- 更新 `docs/GUIDE.md` API 参考。

## 8. 边界与错误处理

- **同名冲突**：同目标文件夹内同名文件追加 ` (1)`、` (2)`（路径级），与内容查重互不影响。
- **网络不可达**：传输失败 → `transfer_state = failed` + 重试按钮；失败原因写入审计/日志。
- **重启恢复**：幂等重传，目标已存在且大小一致则跳过。
- **大视频哈希**：分块流式，仅在后台空闲或按钮触发，绝不在上传请求内同步计算。
- **权限**：上传需 `media:create`；查重删除需 admin（与现有删除一致）；全程审计日志（`activity` 表 + `audit_logs`）。
- **暂存清理**：上传成功后删暂存；启动时清理孤儿暂存（无对应 DB 记录且超时的）。
- **非媒体文件**：保留现有 `fileFilter`（仅图片/视频）。

## 9. 不做（YAGNI）

- tus 式分块续传协议。
- 跨存储根去重（多 UPLOAD_DIR）。
- 拖入文件夹保留内部目录结构（统一拍平到目标设备文件夹）。
- 断网跨会话断点续传（会话内失败重试即可）。
- 真正“无限”单文件大小（保留可配软上限）。

## 10. 验收标准

1. 可一次拖入上百个文件，前端分批并发上传，进度可见，无可见数量上限提示。
2. 文件按 `media/{年}/{YYYYMMDD活动名}/{设备名}/{文件}` 自动归档；可选已有文件夹或新建。
3. 外部/网络存储地址可用；网络路径走 `robocopy`，本机走 Node 拷贝（日志可验证分派）。
4. 服务重启后进行中的传输可恢复完成。
5. 查重按钮可对全库算哈希并出重复分组报告；可保留一个、删除其余。
6. 后台空闲任务渐进为未哈希素材补算哈希。
7. 权限与审计符合既有约定；UI 满足触控目标/焦点/可访问性强制项。
