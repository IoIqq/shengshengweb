# 🛠️ 维护手册

本文档涵盖项目的日常维护、代码质量、故障排查等内容。

## 📑 目录

- [维护周期](#维护周期)
- [维护命令](#维护命令)
- [ESLint 使用指南](#eslint-使用指南)
- [故障排查](#故障排查)
- [性能优化](#性能优化)
- [安全建议](#安全建议)

---

## 🔄 维护周期

### 每日维护（5 分钟）

- [ ] 检查服务运行状态：`pm2 status`
- [ ] 查看错误日志：`pm2 logs --lines 50`
- [ ] 检查磁盘空间

### 每周维护（15 分钟）

- [ ] 运行维护脚本：`npm run maintenance`
- [ ] 检查依赖更新：`npm outdated`
- [ ] 代码质量检查：`npm run lint`
- [ ] 备份数据库

### 每月维护（30 分钟）

- [ ] 更新依赖包：`npm update && npm audit fix`
- [ ] 数据库优化（自动包含在 maintenance 脚本中）
- [ ] 性能测试
- [ ] 审查代码质量
- [ ] 更新文档

### 每季度维护（1-2 小时）

- [ ] 代码重构
- [ ] 架构评估
- [ ] 技术债务清理
- [ ] 全面备份和恢复测试

---

## 🛠️ 维护命令

### 代码质量

```bash
npm run lint          # 代码检查
npm run lint:fix      # 自动修复代码问题
npm run format        # 代码格式化
npm run format:check  # 检查代码格式
npm run check         # 完整检查（代码+安全）
```

### 依赖管理

```bash
npm outdated          # 检查过时依赖
npm update            # 更新依赖
npm audit             # 安全审计
npm audit fix         # 自动修复安全问题
npm run clean         # 清理并重新安装
```

### 服务管理

```bash
npm run start         # 启动服务
npm run dev           # 开发模式
npm run prod          # 生产模式
npm run pm2:start     # PM2 启动
npm run pm2:reload    # PM2 重载
npm run pm2:stop      # PM2 停止
```

### 维护任务

```bash
npm run maintenance              # 完整维护
node server/scripts/init-db.js   # 初始化数据库
node server/scripts/check-env.js # 环境检查
```

---

## 📘 ESLint 使用指南

### 什么是 ESLint？

ESLint 是 JavaScript 代码检查工具，可以：
- ✅ 自动发现代码错误
- ✅ 统一代码风格
- ✅ 强制执行最佳实践

### 快速使用

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

### 常见问题及解决

#### 1. 未使用的变量
```javascript
// ❌ 警告
const unused = '没用';

// ✅ 解决：删除或使用
```

#### 2. 缺少分号
```javascript
// ❌ 缺少分号
const name = '张三'

// ✅ 添加分号（可自动修复）
const name = '张三';
```

#### 3. 引号不统一
```javascript
// ❌ 双引号
const name = "张三";

// ✅ 单引号（可自动修复）
const name = '张三';
```

#### 4. 缩进错误
```javascript
// ❌ 4 空格
function test() {
    return 'hello';
}

// ✅ 2 空格（可自动修复）
function test() {
  return 'hello';
}
```

#### 5. 使用 == 而不是 ===
```javascript
// ❌ 类型转换比较
if (age == 18) {}

// ✅ 严格比较
if (age === 18) {}
```

### VS Code 集成

1. 安装 "ESLint" 扩展
2. 配置自动修复（settings.json）：
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### 忽略特定行

```javascript
// eslint-disable-next-line no-console
console.log('这行不会被检查');

const x = 10; // eslint-disable-line no-unused-vars
```

### 最佳实践

1. ✅ 提交前运行 `npm run lint`
2. ✅ 优先使用 `npm run lint:fix` 自动修复
3. ✅ 在编辑器中安装扩展
4. ✅ 团队统一配置

---

## 🐛 故障排查

### 服务无法启动

#### 1. 端口被占用
```bash
# Windows
netstat -ano | findstr :3002

# Linux/Mac
lsof -i :3002
```
**解决**：修改 `.env` 中的 `PORT` 或关闭占用程序

#### 2. 环境配置问题
```bash
node server/scripts/check-env.js
```

#### 3. 依赖问题
```bash
npm run clean  # 清理重装
```

### 数据库问题

#### 1. 数据库损坏
```bash
# 备份当前数据库
cp server/data/studio.sqlite server/data/studio.sqlite.bak

# 检查完整性
sqlite3 server/data/studio.sqlite "PRAGMA integrity_check;"

# 如无法修复，重新初始化
node server/scripts/init-db.js
```

#### 2. 数据库文件不存在
```bash
node server/scripts/init-db.js
```

### 上传问题

#### 1. 权限问题（Linux/Mac）
```bash
chmod -R 755 server/uploads
chown -R $USER:$USER server/uploads
```

#### 2. 文件过大
修改 `.env`：
```env
MAX_UPLOAD_MB=500
MAX_UPLOAD_FILES=50
```

### 网络访问问题

#### 1. 局域网无法访问

**检查防火墙**：
```bash
# Windows
netsh advfirewall firewall add rule name="Shengsheng Studio" dir=in action=allow protocol=TCP localport=3002

# Linux (Ubuntu)
sudo ufw allow 3002

# Linux (CentOS)
sudo firewall-cmd --add-port=3002/tcp --permanent
sudo firewall-cmd --reload
```

#### 2. 检查监听地址
确保 `.env` 中：
```env
HOST=0.0.0.0
```

### 性能问题

#### 1. 响应缓慢

**检查数据库大小**：
```bash
ls -lh server/data/studio.sqlite
```

**优化数据库**：
```bash
sqlite3 server/data/studio.sqlite "VACUUM;"
```

#### 2. 内存占用高

**重启服务**：
```bash
pm2 restart shengsheng-studio
```

**检查内存**：
```bash
pm2 monit
```

### 登录问题

#### 1. 忘记管理员密码

修改 `.env`：
```env
ADMIN_PASSWORD=新密码
```

重启服务后即可使用新密码。

#### 2. 登录失败

- 检查 `.env` 中的用户名和密码
- 检查 cookies 是否被禁用
- 清除浏览器缓存

### 依赖安装失败

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules package-lock.json

# 使用国内镜像
npm config set registry https://registry.npmmirror.com

# 重新安装
npm install
```

---

## 📈 性能优化

### 数据库优化

```bash
# 定期 VACUUM
sqlite3 server/data/studio.sqlite "VACUUM;"

# 或运行维护脚本（自动 VACUUM）
npm run maintenance
```

### 文件管理

```bash
# 清理临时文件
rm -rf server/uploads/inbox/*

# 删除 90 天前的旧文件
find server/uploads -type f -mtime +90 -delete
```

### 使用外部存储

如果数据量大，使用外部硬盘：

编辑 `.env`：
```env
DATABASE_PATH=D:/StudioData/database.sqlite
UPLOAD_DIR=D:/StudioData/uploads
INBOX_DIR=D:/StudioData/uploads/inbox
```

### 代码优化建议

1. **移除未使用的代码**
2. **优化数据库查询**
3. **添加适当的索引**
4. **使用缓存**

---

## 🔒 安全建议

### 必做事项

1. **修改默认密码**
   ```env
   ADMIN_PASSWORD=强密码（至少 12 位）
   ```

2. **定期更新依赖**
   ```bash
   npm audit
   npm audit fix
   npm update
   ```

3. **定期备份**
   ```bash
   cp server/data/studio.sqlite backup/studio-$(date +%Y%m%d).sqlite
   tar -czf backup/uploads-$(date +%Y%m%d).tar.gz server/uploads/
   ```

### 推荐做法

1. **使用强密码**
   - 至少 12 位
   - 包含大小写字母、数字、符号

2. **限制访问**
   - 仅在局域网内使用
   - 配置防火墙规则

3. **使用 HTTPS**（生产环境）
   - 配置 SSL 证书
   - 使用 Nginx 反向代理

4. **审查日志**
   - 定期查看访问日志
   - 注意异常登录

---

## 📊 监控指标

### 性能指标

| 指标 | 健康值 | 警告值 |
|------|--------|--------|
| 响应时间 | < 200ms | > 500ms |
| 内存使用 | < 512MB | > 1GB |
| CPU 使用 | < 50% | > 80% |
| 磁盘使用 | < 80% | > 90% |

### 健康指标

- **服务可用性**：> 99.9%
- **错误率**：< 0.1%
- **数据库大小**：监控增长趋势
- **上传目录大小**：定期清理

---

## 📝 维护日志模板

```markdown
## 维护日期：YYYY-MM-DD

### 执行的任务
- [x] 运行维护脚本
- [x] 更新依赖包
- [x] 备份数据库

### 发现的问题
- 描述问题

### 采取的措施
- 描述解决方案

### 下次注意事项
- 描述需要关注的事项
```

---

## 📞 获取帮助

- **部署问题**：查看 [DEPLOYMENT.md](DEPLOYMENT.md)
- **项目结构**：查看 [PROJECT_GUIDE.md](PROJECT_GUIDE.md)
- **更新历史**：查看 [CHANGELOG.md](CHANGELOG.md)
- **GitHub Issues**：https://github.com/IoIqq/shengshengweb/issues

---

**最后更新**：2026-06-01
