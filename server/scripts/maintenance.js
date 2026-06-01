#!/usr/bin/env node

/**
 * 日常维护脚本
 * 自动执行常规维护任务
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 开始日常维护...\n');
console.log('=' .repeat(50));

let hasErrors = false;

// 辅助函数：执行命令
function runCommand(command, description, optional = false) {
  console.log(`\n📋 ${description}...`);
  console.log(`   命令: ${command}`);

  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf-8' });
    console.log(`✅ ${description} 完成`);
    return true;
  } catch (error) {
    if (optional) {
      console.log(`⚠️  ${description} 跳过（可选）`);
      return false;
    } else {
      console.error(`❌ ${description} 失败`);
      hasErrors = true;
      return false;
    }
  }
}

// 1. 检查依赖更新
console.log('\n' + '='.repeat(50));
console.log('[1/7] 检查依赖更新');
console.log('='.repeat(50));
try {
  execSync('npm outdated', { stdio: 'inherit' });
} catch (e) {
  // npm outdated 有更新时会返回非零退出码，这是正常的
  console.log('ℹ️  依赖检查完成');
}

// 2. 安全审计
console.log('\n' + '='.repeat(50));
console.log('[2/7] 安全审计');
console.log('='.repeat(50));
try {
  execSync('npm audit', { stdio: 'inherit' });
  console.log('✅ 安全审计通过');
} catch (e) {
  console.log('⚠️  发现安全问题，建议运行: npm audit fix');
}

// 3. 代码检查（如果已安装 ESLint）
console.log('\n' + '='.repeat(50));
console.log('[3/7] 代码检查');
console.log('='.repeat(50));
if (fs.existsSync('node_modules/eslint')) {
  runCommand('npm run lint', '代码检查', true);
} else {
  console.log('ℹ️  ESLint 未安装，跳过代码检查');
  console.log('   安装: npm install --save-dev eslint');
}

// 4. 清理临时文件
console.log('\n' + '='.repeat(50));
console.log('[4/7] 清理临时文件');
console.log('='.repeat(50));

const tempPatterns = [
  'server/uploads/inbox/.write-test',
  '*.log',
  '*.tmp',
  '.DS_Store',
  'Thumbs.db'
];

let cleanedCount = 0;
tempPatterns.forEach(pattern => {
  try {
    // 简单的文件清理（实际项目中可能需要更复杂的逻辑）
    if (pattern.includes('/')) {
      const filePath = pattern;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        cleanedCount++;
        console.log(`   删除: ${filePath}`);
      }
    }
  } catch (error) {
    // 忽略清理错误
  }
});

console.log(`✅ 清理完成，删除 ${cleanedCount} 个临时文件`);

// 5. 数据库优化
console.log('\n' + '='.repeat(50));
console.log('[5/7] 数据库优化');
console.log('='.repeat(50));

require('dotenv').config();
const dbPath = process.env.DATABASE_PATH || 'server/data/studio.sqlite';

if (fs.existsSync(dbPath)) {
  try {
    const initSqlJs = require('sql.js');

    initSqlJs().then(SQL => {
      const buffer = fs.readFileSync(dbPath);
      const db = new SQL.Database(buffer);

      // 执行 VACUUM 优化数据库
      db.run('VACUUM;');

      // 保存优化后的数据库
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));

      const stats = fs.statSync(dbPath);
      console.log('✅ 数据库优化完成');
      console.log(`   路径: ${dbPath}`);
      console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
    }).catch(error => {
      console.log('⚠️  数据库优化失败:', error.message);
    });
  } catch (error) {
    console.log('⚠️  数据库优化跳过:', error.message);
  }
} else {
  console.log('ℹ️  数据库文件不存在，跳过优化');
}

// 6. 检查磁盘空间
console.log('\n' + '='.repeat(50));
console.log('[6/7] 检查磁盘空间');
console.log('='.repeat(50));

try {
  const uploadDir = process.env.UPLOAD_DIR || 'server/uploads';

  if (fs.existsSync(uploadDir)) {
    let totalSize = 0;

    function getDirectorySize(dir) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      });
    }

    getDirectorySize(uploadDir);

    console.log(`✅ 上传目录大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    if (totalSize > 1024 * 1024 * 1024) { // 1GB
      console.log('⚠️  上传目录较大，建议定期清理');
    }
  }
} catch (error) {
  console.log('⚠️  磁盘空间检查失败:', error.message);
}

// 7. 生成维护报告
console.log('\n' + '='.repeat(50));
console.log('[7/7] 生成维护报告');
console.log('='.repeat(50));

const report = {
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  platform: process.platform,
  hasErrors: hasErrors
};

const reportPath = 'maintenance-report.json';
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`✅ 维护报告已生成: ${reportPath}`);

// 总结
console.log('\n' + '='.repeat(50));
console.log('维护完成');
console.log('='.repeat(50));

if (hasErrors) {
  console.log('\n⚠️  维护过程中发现问题，请检查上述错误');
  process.exit(1);
} else {
  console.log('\n✅ 所有维护任务完成！');
  console.log('\n📝 建议：');
  console.log('   - 定期运行此脚本（每周一次）');
  console.log('   - 及时更新依赖包');
  console.log('   - 定期备份数据');
  console.log('   - 查看维护报告了解详情');
}
