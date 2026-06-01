/**
 * 环境检查脚本
 * 检查运行环境是否满足要求
 */

const fs = require('fs');
const path = require('path');

function checkEnvironment() {
  console.log('🔍 检查运行环境...\n');

  const checks = [];
  let hasError = false;
  let hasWarning = false;

  // 1. 检查 Node.js 版本
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  const nodeCheck = {
    name: 'Node.js 版本',
    pass: majorVersion >= 18,
    level: majorVersion >= 18 ? 'success' : 'error',
    message: `当前: ${nodeVersion}，要求: >= 18.0.0`
  };
  checks.push(nodeCheck);
  if (!nodeCheck.pass) hasError = true;

  // 2. 检查 .env 文件
  const envCheck = {
    name: '.env 配置文件',
    pass: fs.existsSync('.env'),
    level: fs.existsSync('.env') ? 'success' : 'error',
    message: fs.existsSync('.env') ? '已存在' : '缺失，请复制 .env.example 并配置'
  };
  checks.push(envCheck);
  if (!envCheck.pass) hasError = true;

  // 加载环境变量（如果存在）
  if (envCheck.pass) {
    require('dotenv').config();
  }

  // 3. 检查必要目录
  const dirs = [
    { path: 'server/data', required: true },
    { path: 'server/uploads', required: true },
    { path: 'server/uploads/media', required: true },
    { path: 'server/uploads/inbox', required: true }
  ];

  dirs.forEach(dir => {
    const exists = fs.existsSync(dir.path);
    const check = {
      name: `目录 ${dir.path}`,
      pass: exists,
      level: exists ? 'success' : (dir.required ? 'warning' : 'info'),
      message: exists ? '已存在' : '缺失（将自动创建）'
    };
    checks.push(check);
    if (!check.pass && dir.required) hasWarning = true;
  });

  // 4. 检查数据库
  const dbPath = process.env.DATABASE_PATH || 'server/data/studio.sqlite';
  const dbExists = fs.existsSync(dbPath);
  const dbCheck = {
    name: '数据库文件',
    pass: dbExists,
    level: dbExists ? 'success' : 'warning',
    message: dbExists ? `已存在 (${dbPath})` : `将自动创建 (${dbPath})`
  };
  checks.push(dbCheck);
  if (!dbCheck.pass) hasWarning = true;

  // 5. 检查上传目录权限
  const uploadDir = process.env.UPLOAD_DIR || 'server/uploads';
  if (fs.existsSync(uploadDir)) {
    try {
      const testFile = path.join(uploadDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      checks.push({
        name: '上传目录权限',
        pass: true,
        level: 'success',
        message: '可写'
      });
    } catch (error) {
      checks.push({
        name: '上传目录权限',
        pass: false,
        level: 'error',
        message: '无写入权限'
      });
      hasError = true;
    }
  }

  // 6. 检查端口配置
  const port = process.env.PORT || 3002;
  checks.push({
    name: '服务端口',
    pass: true,
    level: 'info',
    message: `${port}`
  });

  // 7. 检查管理员配置
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminConfigured = adminUsername && adminPassword;
  const isDefaultPassword = adminPassword === 'ShengSheng@2026';

  checks.push({
    name: '管理员账号',
    pass: adminConfigured,
    level: adminConfigured ? (isDefaultPassword ? 'warning' : 'success') : 'error',
    message: adminConfigured
      ? (isDefaultPassword ? '使用默认密码（建议修改）' : '已配置')
      : '未配置'
  });
  if (!adminConfigured) hasError = true;
  if (isDefaultPassword) hasWarning = true;

  // 8. 检查依赖包
  const nodeModulesExists = fs.existsSync('node_modules');
  checks.push({
    name: '依赖包',
    pass: nodeModulesExists,
    level: nodeModulesExists ? 'success' : 'error',
    message: nodeModulesExists ? '已安装' : '未安装，请运行 npm install'
  });
  if (!nodeModulesExists) hasError = true;

  // 输出结果
  checks.forEach(check => {
    let icon;
    switch (check.level) {
      case 'success':
        icon = '✅';
        break;
      case 'warning':
        icon = '⚠️ ';
        break;
      case 'error':
        icon = '❌';
        break;
      default:
        icon = 'ℹ️ ';
    }
    console.log(`${icon} ${check.name}: ${check.message}`);
  });

  console.log('');

  // 总结
  if (hasError) {
    console.log('❌ 环境检查失败，存在严重问题');
    console.log('   请先解决上述错误，然后重新运行部署脚本\n');
    process.exit(1);
  } else if (hasWarning) {
    console.log('⚠️  环境检查通过，但存在警告');
    console.log('   建议解决上述警告以获得最佳体验\n');
  } else {
    console.log('✅ 环境检查通过，所有配置正常\n');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  try {
    checkEnvironment();
  } catch (error) {
    console.error('❌ 环境检查失败:', error.message);
    process.exit(1);
  }
}

module.exports = checkEnvironment;
