/**
 * 环境检查脚本
 * 检查运行环境是否满足要求
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('../config');

function displayPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function pathSourceLabel(source) {
  if (source === 'env') return '.env';
  if (source === 'storage-config') return '界面配置';
  return '默认值';
}

function checkPath(checks, label, targetPath, required = true) {
  const exists = fs.existsSync(targetPath);
  checks.push({
    name: label,
    pass: exists,
    level: exists ? 'success' : (required ? 'warning' : 'info'),
    message: exists ? `已存在 (${displayPath(targetPath)})` : `缺失，将在启动时尝试创建 (${displayPath(targetPath)})`
  });
  return exists;
}

function checkWritable(checks, label, targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  try {
    const testFile = path.join(targetPath, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    checks.push({ name: label, pass: true, level: 'success', message: '可写' });
    return true;
  } catch (error) {
    checks.push({ name: label, pass: false, level: 'error', message: '无写入权限' });
    return false;
  }
}

function checkEnvironment() {
  console.log('🔍 检查运行环境...\n');

  const checks = [];
  let hasError = false;
  let hasWarning = false;

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

  const envExists = fs.existsSync('.env');
  checks.push({
    name: '.env 配置文件',
    pass: envExists,
    level: envExists ? 'success' : 'warning',
    message: envExists ? '已存在' : '缺失，将使用默认配置或界面存储配置'
  });
  if (!envExists) hasWarning = true;

  checks.push({
    name: '素材目录配置来源',
    pass: true,
    level: 'info',
    message: `UPLOAD_DIR=${pathSourceLabel(config.UPLOAD_DIR_SOURCE)}，INBOX_DIR=${pathSourceLabel(config.INBOX_DIR_SOURCE)}`
  });

  if ((config.UPLOAD_DIR_SOURCE === 'env' || config.INBOX_DIR_SOURCE === 'env') && config.STORAGE_CONFIG?.uploadDir) {
    checks.push({
      name: '存储配置优先级',
      pass: true,
      level: 'warning',
      message: '.env 正在覆盖 server/data/storage-config.json 中的界面配置'
    });
    hasWarning = true;
  }

  const dirs = [
    { label: '数据目录', path: config.DATA_DIR, required: true },
    { label: '数据库父目录', path: path.dirname(config.DB_PATH), required: true },
    { label: '上传根目录', path: config.UPLOAD_DIR, required: true },
    { label: '媒体目录', path: config.MEDIA_DIR, required: true },
    { label: 'Inbox 目录', path: config.INBOX_DIR, required: true },
    { label: '头像目录', path: config.AVATAR_DIR, required: true },
    { label: '设备图片目录', path: config.DEVICE_IMAGE_DIR, required: true },
  ];

  dirs.forEach(dir => {
    const exists = checkPath(checks, dir.label, dir.path, dir.required);
    if (!exists && dir.required) hasWarning = true;
  });

  const dbExists = fs.existsSync(config.DB_PATH);
  checks.push({
    name: '数据库文件',
    pass: dbExists,
    level: dbExists ? 'success' : 'warning',
    message: dbExists ? `已存在 (${displayPath(config.DB_PATH)})` : `将自动创建 (${displayPath(config.DB_PATH)})`
  });
  if (!dbExists) hasWarning = true;

  if (!checkWritable(checks, '上传目录权限', config.UPLOAD_DIR)) hasError = fs.existsSync(config.UPLOAD_DIR) || hasError;

  checks.push({
    name: '服务端口',
    pass: true,
    level: 'info',
    message: `${config.PORT}`
  });

  const adminUsername = config.ADMIN_USERNAME;
  const adminPassword = config.ADMIN_PASSWORD;
  const adminConfigured = adminUsername && adminPassword;
  const isWeakDefaultPassword = adminPassword === 'admin123456' || adminPassword === 'ShengSheng@2026';

  checks.push({
    name: '管理员账号',
    pass: adminConfigured,
    level: adminConfigured ? (isWeakDefaultPassword ? 'warning' : 'success') : 'error',
    message: adminConfigured
      ? (isWeakDefaultPassword ? '使用默认密码（建议修改）' : '已配置')
      : '未配置'
  });
  if (!adminConfigured) hasError = true;
  if (isWeakDefaultPassword) hasWarning = true;

  const nodeModulesExists = fs.existsSync('node_modules');
  checks.push({
    name: '依赖包',
    pass: nodeModulesExists,
    level: nodeModulesExists ? 'success' : 'error',
    message: nodeModulesExists ? '已安装' : '未安装，请运行 npm install'
  });
  if (!nodeModulesExists) hasError = true;

  checks.forEach(check => {
    let icon;
    switch (check.level) {
      case 'success': icon = '✅'; break;
      case 'warning': icon = '⚠️ '; break;
      case 'error': icon = '❌'; break;
      default: icon = 'ℹ️ ';
    }
    console.log(`${icon} ${check.name}: ${check.message}`);
  });

  console.log('');

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

if (require.main === module) {
  try {
    checkEnvironment();
  } catch (error) {
    console.error('❌ 环境检查失败:', error.message);
    process.exit(1);
  }
}

module.exports = checkEnvironment;
