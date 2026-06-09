/**
 * 数据库初始化脚本
 * 复用运行时数据库模型创建当前 schema
 */

require('dotenv').config();
const path = require('path');
const config = require('../config');
const { ensureDir } = require('../utils');
const { initDatabase, saveDatabase } = require('../models/database');

async function initDatabaseScript() {
  console.log('🔧 正在初始化数据库...\n');

  try {
    ensureDir(config.DATA_DIR);
    ensureDir(path.dirname(config.DB_PATH));

    await initDatabase();
    saveDatabase();

    console.log('\n✅ 数据库初始化完成');
    console.log(`   路径: ${config.DB_PATH}`);
  } catch (error) {
    console.error('\n❌ 数据库初始化失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  initDatabaseScript().catch(error => {
    console.error('初始化失败:', error.message || error);
    process.exit(1);
  });
}

module.exports = initDatabaseScript;
