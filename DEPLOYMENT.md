# 📦 部署指南

本文档提供详细的部署说明，帮助你在新电脑上快速部署项目。

## 🚀 快速部署（推荐）

### Windows 系统

1. **运行部署脚本**
   ```cmd
   setup.bat
   ```

2. **等待自动完成**
   - 检查环境
   - 安装依赖
   - 配置环境变量
   - 创建目录
   - 初始化数据库

3. **修改配置**
   ```cmd
   notepad .env
   ```
   **重要**：修改 `ADMIN_PASSWORD` 为你的密码

4. **启动服务**
   ```cmd
   npm run start
   ```

### Linux / macOS 系统

1. **添加执行权限并运行**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

2. **修改配置**
   ```bash
   nano .env
   # 或
   vim .env
   ```
   **重要**：修改 `ADMIN_PASSWORD` 为你的密码

3. **启动服务**
   ```bash
   npm run start
   ```

---

## 📋 手动部署

如果自动部署脚本无法运行，可以按照以下步骤手动部署。

### 1. 环境要求

| 项目 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 18.0.0 | [下载地址](https://nodejs.org/) |
| npm | >= 9.0.0 | 随 Node.js 一起安装 |
| 磁盘空间 | >= 1GB | 用于依赖和数据存储 |
| 内存 | >= 512MB | 推荐 1GB 以上 |

**检查版本**：
```bash
node --version
npm --version
```

### 2. 获取项目

**方式 A：从 GitHub 克隆**
```bash
git clone https://github.com/IoIqq/shengshengweb.git
cd shengshengweb
```

**方式 B：下载压缩包**
1. 下载项目压缩包
2. 解压到目标目录
3. 进入项目目录

### 3. 安装依赖

```bash
npm install
```

**如果安装失败**，尝试使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### 4. 配置环境变量

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

**编辑 `.env` 文件**，修改以下配置：

```env
# 服务器配置
PORT=3002                    # 服务端口
HOST=0.0.0.0                 # 监听地址

# 管理员账号（重要！）
ADMIN_USERNAME=admin         # 管理员用户名
ADMIN_PASSWORD=你的密码      # 修改为强密码

# 数据存储路径
DATABASE_PATH=server/data/studio.sqlite
UPLOAD_DIR=server/uploads
INBOX_DIR=server/uploads/inbox
```

### 5. 创建必要目录

```bash
# Windows
mkdir server\data
mkdir server\uploads\media
mkdir server\uploads\inbox

# Linux/Mac
mkdir -p server/data
mkdir -p server/uploads/media
mkdir -p server/uploads/inbox
chmod -R 755 server/uploads
```

### 6. 初始化数据库

```bash
node server/scripts/init-db.js
```

### 7. 启动服务

**开发模式**（自动重启）：
```bash
npm run dev
```

**生产模式**：
```bash
npm run start
```

**使用 PM2**（推荐生产环境）：
```bash
npm install -g pm2
npm run pm2:start
```

### 8. 访问网站

- **本地访问**：http://localhost:3002
- **局域网访问**：http://你的IP:3002

---

## 🔄 迁移到新电脑

### 方法 1：完整迁移（推荐）

1. **打包整个项目**
   ```bash
   # 压缩项目文件夹
   tar -czf shengsheng-backup.tar.gz shengsheng-ideology-studio-site/
   # 或使用 zip
   zip -r shengsheng-backup.zip shengsheng-ideology-studio-site/
   ```

2. **复制到新电脑**
   - 通过 U 盘、网络共享或云盘传输

3. **解压并安装依赖**
   ```bash
   tar -xzf shengsheng-backup.tar.gz
   cd shengsheng-ideology-studio-site
   npm install
   ```

4. **启动服务**
   ```bash
   npm run start
   ```

### 方法 2：仅迁移数据

如果新电脑需要重新部署项目，只需迁移数据：

1. **在旧电脑上备份数据**
   ```bash
   # 备份数据库
   cp server/data/studio.sqlite backup/

   # 备份上传文件
   cp -r server/uploads backup/

   # 备份配置
   cp .env backup/
   ```

2. **在新电脑上部署项目**
   ```bash
   # 运行部署脚本
   ./setup.sh  # 或 setup.bat
   ```

3. **恢复数据**
   ```bash
   # 恢复数据库
   cp backup/studio.sqlite server/data/

   # 恢复上传文件
   cp -r backup/uploads/* server/uploads/

   # 恢复配置（可选）
   cp backup/.env .env
   ```

4. **启动服务**
   ```bash
   npm run start
   ```

---

## 🔧 生产环境部署

### 使用 PM2 管理进程

**安装 PM2**：
```bash
npm install -g pm2
```

**启动服务**：
```bash
npm run pm2:start
```

**常用命令**：
```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs shengsheng-studio

# 重启服务
pm2 restart shengsheng-studio

# 停止服务
pm2 stop shengsheng-studio

# 删除进程
pm2 delete shengsheng-studio

# 开机自启
pm2 startup
pm2 save
```

### 配置反向代理（可选）

如果使用 Nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 💾 备份与恢复

### 自动备份脚本

创建 `backup.sh`（Linux/Mac）：
```bash
#!/bin/bash
BACKUP_DIR="backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# 备份数据库
cp server/data/studio.sqlite $BACKUP_DIR/

# 备份上传文件
tar -czf $BACKUP_DIR/uploads.tar.gz server/uploads/

# 备份配置
cp .env $BACKUP_DIR/

echo "备份完成: $BACKUP_DIR"
```

创建 `backup.bat`（Windows）：
```batch
@echo off
set BACKUP_DIR=backup\%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
mkdir %BACKUP_DIR%

copy server\data\studio.sqlite %BACKUP_DIR%\
xcopy server\uploads %BACKUP_DIR%\uploads\ /E /I /Y
copy .env %BACKUP_DIR%\

echo 备份完成: %BACKUP_DIR%
```

### 定期备份（推荐）

**Linux/Mac 使用 cron**：
```bash
# 编辑 crontab
crontab -e

# 每天凌晨 2 点备份
0 2 * * * cd /path/to/project && ./backup.sh
```

**Windows 使用任务计划程序**：
1. 打开"任务计划程序"
2. 创建基本任务
3. 设置触发器（每天）
4. 操作：启动程序 `backup.bat`

---

## 🐛 常见问题

### 1. 端口被占用

**错误**：`Error: listen EADDRINUSE: address already in use :::3002`

**解决**：
- 修改 `.env` 中的 `PORT` 值
- 或关闭占用端口的程序

**查找占用进程**：
```bash
# Windows
netstat -ano | findstr :3002

# Linux/Mac
lsof -i :3002
```

### 2. 权限问题

**错误**：`EACCES: permission denied`

**解决**：
```bash
# Linux/Mac
chmod -R 755 server/uploads
chown -R $USER:$USER server/

# Windows
# 右键文件夹 -> 属性 -> 安全 -> 编辑权限
```

### 3. 数据库损坏

**解决**：
```bash
# 备份旧数据库
mv server/data/studio.sqlite server/data/studio.sqlite.bak

# 重新初始化
node server/scripts/init-db.js
```

### 4. 依赖安装失败

**解决**：
```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 5. 无法访问（防火墙）

**Windows**：
```cmd
# 添加防火墙规则
netsh advfirewall firewall add rule name="Shengsheng Studio" dir=in action=allow protocol=TCP localport=3002
```

**Linux**：
```bash
# Ubuntu/Debian
sudo ufw allow 3002

# CentOS/RHEL
sudo firewall-cmd --add-port=3002/tcp --permanent
sudo firewall-cmd --reload
```

---

## 📊 性能优化

### 1. 使用外部存储

如果数据量大，建议使用外部硬盘：

编辑 `.env`：
```env
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox
```

### 2. 定期清理

```bash
# 清理旧日志
pm2 flush

# 清理临时文件
rm -rf server/uploads/inbox/*
```

### 3. 数据库优化

```bash
# 压缩数据库
sqlite3 server/data/studio.sqlite "VACUUM;"
```

---

## 🔒 安全建议

1. **修改默认密码**
   - 使用强密码（至少 12 位，包含大小写字母、数字、符号）

2. **限制访问**
   - 仅在局域网内使用
   - 或配置防火墙规则

3. **定期备份**
   - 每天自动备份数据
   - 保留多个备份版本

4. **更新依赖**
   ```bash
   npm audit
   npm update
   ```

5. **使用 HTTPS**
   - 配置 SSL 证书
   - 使用 Nginx 反向代理

---

## 📞 获取帮助

- **文档**：查看 `README.md` 和 `PROJECT_GUIDE.md`
- **问题排查**：查看 `TROUBLESHOOTING.md`
- **GitHub Issues**：https://github.com/IoIqq/shengshengweb/issues

---

## 📝 更新日志

### v2.0.1
- ✅ 添加自动部署脚本
- ✅ 添加环境检查功能
- ✅ 完善部署文档
- ✅ 优化迁移流程

---

**祝你部署顺利！** 🎉
