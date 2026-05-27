# 部署指南

## 快速开始

### 本地开发
```bash
npm install
npm run dev
```

访问 `http://127.0.0.1:3001`

---

## 外部硬盘部署（推荐用于便携式使用）

### 为什么使用外部硬盘？
- ✅ 数据完全独立，可随时迁移
- ✅ 不占用系统盘空间
- ✅ 方便备份和恢复
- ✅ 支持多台电脑共享数据

### 配置步骤

#### 1. 准备外部硬盘
确保外部硬盘已连接并分配盘符（例如 `D:` 或 `E:`）

#### 2. 创建存储目录
在外部硬盘上创建数据目录：
```
D:\StudioData\
├── database.sqlite    （数据库文件）
├── uploads\
│   ├── media\         （上传的素材）
│   └── inbox\         （服务器同步目录）
```

#### 3. 配置环境变量
编辑项目根目录的 `.env` 文件：

```env
# 使用外部硬盘（Windows 示例）
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox

# 或使用相对路径（相对于项目根目录）
# DATABASE_PATH=../data/studio.sqlite
# UPLOAD_DIR=../uploads
```

**重要提示**：
- Windows 路径使用正斜杠 `/` 或双反斜杠 `\\`
- 绝对路径示例：`D:/StudioData/database.sqlite`
- 相对路径示例：`../external-data/database.sqlite`

#### 4. 启动服务
```bash
npm start
```

服务器会自动在外部硬盘创建必要的目录。

---

## 多环境配置

### 开发环境（本地）
`.env.development`
```env
DATABASE_PATH=server/data/studio.sqlite
UPLOAD_DIR=server/uploads
```

### 生产环境（外部硬盘）
`.env.production`
```env
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox
```

---

## 便携式部署方案

### 方案 A：U盘/移动硬盘完整部署

将整个项目和数据都放在外部存储：

```
E:\StudioPortable\
├── app\                    （项目代码）
│   ├── server\
│   ├── index.html
│   ├── package.json
│   └── .env
└── data\                   （数据目录）
    ├── database.sqlite
    └── uploads\
```

`.env` 配置：
```env
DATABASE_PATH=../data/database.sqlite
UPLOAD_DIR=../data/uploads
INBOX_DIR=../data/uploads/inbox
```

### 方案 B：代码本地 + 数据外部

代码在系统盘，数据在外部硬盘：

```
C:\Projects\studio\         （代码）
D:\StudioData\              （数据）
```

`.env` 配置：
```env
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox
```

---

## 数据迁移

### 从本地迁移到外部硬盘

1. **停止服务**
```bash
# 如果使用 PM2
npm run pm2:stop

# 或直接 Ctrl+C 停止
```

2. **复制数据**
```bash
# Windows
xcopy /E /I server\data D:\StudioData
xcopy /E /I server\uploads D:\StudioData\uploads

# Linux/Mac
cp -r server/data/* /mnt/external/StudioData/
cp -r server/uploads/* /mnt/external/StudioData/uploads/
```

3. **更新配置**
修改 `.env` 文件指向新位置

4. **重启服务**
```bash
npm start
```

### 在不同电脑间迁移

1. 确保外部硬盘盘符一致，或使用相对路径
2. 在新电脑上安装 Node.js 18+
3. 复制项目代码或使用 Git 克隆
4. 安装依赖：`npm install --omit=dev`
5. 配置 `.env` 指向外部硬盘
6. 启动服务

---

## 备份策略

### 自动备份脚本（Windows）

创建 `backup.bat`：
```batch
@echo off
set BACKUP_DIR=D:\Backups\Studio\%date:~0,4%%date:~5,2%%date:~8,2%
mkdir "%BACKUP_DIR%"

echo 备份数据库...
copy D:\StudioData\database.sqlite "%BACKUP_DIR%\"

echo 备份上传文件...
xcopy /E /I D:\StudioData\uploads "%BACKUP_DIR%\uploads"

echo 备份完成！
pause
```

### 自动备份脚本（Linux/Mac）

创建 `backup.sh`：
```bash
#!/bin/bash
BACKUP_DIR="/mnt/backup/studio/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

echo "备份数据库..."
cp /mnt/external/StudioData/database.sqlite "$BACKUP_DIR/"

echo "备份上传文件..."
cp -r /mnt/external/StudioData/uploads "$BACKUP_DIR/"

echo "备份完成！"
```

### 使用管理后台备份

登录后台 → 设置 → 下载备份摘要（JSON 格式）

---

## 性能优化建议

### 外部硬盘性能
- ✅ 使用 USB 3.0+ 接口
- ✅ 选择 SSD 移动硬盘（读写速度更快）
- ✅ 避免频繁插拔
- ⚠️ 机械硬盘可能影响响应速度

### 数据库优化
数据库已自动优化，无需额外配置。如需手动优化：
```javascript
// 在 server.js 中添加索引（已包含）
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at);
  CREATE INDEX IF NOT EXISTS idx_media_review ON media(review_state);
`);
```

---

## 故障排查

### 问题：无法创建目录
**原因**：外部硬盘未连接或路径错误

**解决**：
1. 检查外部硬盘是否已连接
2. 确认盘符是否正确
3. 检查 `.env` 文件路径配置
4. 查看日志：`server/logs/YYYY-MM-DD.log`

### 问题：数据库文件损坏
**原因**：非正常关闭或硬盘故障

**解决**：
1. 从备份恢复数据库文件
2. 如无备份，删除 `database.sqlite` 重新初始化
3. 重新导入数据

### 问题：上传文件找不到
**原因**：UPLOAD_DIR 配置错误

**解决**：
1. 检查 `.env` 中的 `UPLOAD_DIR` 路径
2. 确保目录存在且有写入权限
3. 重启服务

---

## 安全建议

### 数据安全
- 🔒 定期备份数据库和上传文件
- 🔒 使用强密码（修改 `.env` 中的 `ADMIN_PASSWORD`）
- 🔒 不要将 `.env` 文件提交到 Git
- 🔒 外部硬盘使用加密（BitLocker/FileVault）

### 网络安全
- 🔒 生产环境使用 HTTPS（配置反向代理）
- 🔒 限制访问 IP（防火墙规则）
- 🔒 定期更新依赖：`npm audit fix`

---

## 常见场景

### 场景 1：办公室 + 家里两台电脑
使用外部硬盘，配置相对路径：
```env
DATABASE_PATH=../data/database.sqlite
UPLOAD_DIR=../data/uploads
```

### 场景 2：团队共享服务器
使用网络存储（NAS）：
```env
DATABASE_PATH=//192.168.1.100/studio/database.sqlite
UPLOAD_DIR=//192.168.1.100/studio/uploads
```

### 场景 3：云服务器部署
使用云盘挂载：
```env
DATABASE_PATH=/mnt/cloud-disk/studio/database.sqlite
UPLOAD_DIR=/mnt/cloud-disk/studio/uploads
```

---

## 技术支持

遇到问题？
1. 查看日志文件：`server/logs/`
2. 检查启动日志中的路径配置
3. 参考 README.md 排障部分

---

## 更新日志

### v2.0.1
- ✅ 支持绝对路径和相对路径配置
- ✅ 自动创建外部存储目录
- ✅ 增强路径解析功能
- ✅ 完善部署文档
