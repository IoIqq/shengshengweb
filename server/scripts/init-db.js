/**
 * 数据库初始化脚本
 * 创建数据库和表结构
 */

const fs = require('fs');
const path = require('path');

async function initDatabase() {
  console.log('🔧 正在初始化数据库...\n');

  try {
    // 加载环境变量
    require('dotenv').config();

    const initSqlJs = require('sql.js');
    const dbPath = process.env.DATABASE_PATH || 'server/data/studio.sqlite';
    const dbDir = path.dirname(dbPath);

    // 创建目录
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`✅ 创建目录: ${dbDir}`);
    }

    // 检查数据库是否已存在
    if (fs.existsSync(dbPath)) {
      console.log('ℹ️  数据库已存在，跳过初始化');
      console.log(`   路径: ${dbPath}\n`);
      return;
    }

    // 创建数据库
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    console.log('📝 创建表结构...');

    // 创建素材表
    db.run(`
      CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalName TEXT,
        kind TEXT,
        reviewState TEXT DEFAULT 'pending',
        note TEXT,
        tags TEXT,
        uploadedAt INTEGER,
        reviewedAt INTEGER,
        reviewedBy TEXT
      )
    `);
    console.log('  ✓ media 表');

    // 创建待办表
    db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        dueDate TEXT,
        assignee TEXT,
        done INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER
      )
    `);
    console.log('  ✓ todos 表');

    // 创建团队表
    db.run(`
      CREATE TABLE IF NOT EXISTS team (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        avatar TEXT,
        bio TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'active',
        joinedAt INTEGER,
        sortOrder INTEGER DEFAULT 0
      )
    `);
    console.log('  ✓ team 表');

    // 创建设备表
    db.run(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        model TEXT,
        serialNumber TEXT,
        status TEXT DEFAULT 'available',
        location TEXT,
        purchaseDate TEXT,
        note TEXT,
        createdAt INTEGER
      )
    `);
    console.log('  ✓ devices 表');

    // 创建借出记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS borrow_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId INTEGER,
        borrower TEXT NOT NULL,
        purpose TEXT,
        borrowDate TEXT,
        expectedReturnDate TEXT,
        actualReturnDate TEXT,
        status TEXT DEFAULT 'pending',
        note TEXT,
        createdAt INTEGER,
        FOREIGN KEY (deviceId) REFERENCES devices(id)
      )
    `);
    console.log('  ✓ borrow_requests 表');

    // 创建留言墙表
    db.run(`
      CREATE TABLE IF NOT EXISTS wishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        content TEXT NOT NULL,
        mood TEXT,
        isAnonymous INTEGER DEFAULT 0,
        createdAt INTEGER
      )
    `);
    console.log('  ✓ wishes 表');

    // 保存数据库
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    console.log('\n✅ 数据库初始化完成');
    console.log(`   路径: ${dbPath}`);
    console.log(`   大小: ${(buffer.length / 1024).toFixed(2)} KB\n`);

  } catch (error) {
    console.error('\n❌ 数据库初始化失败:', error.message);
    console.error('   详细信息:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initDatabase().catch(error => {
    console.error('初始化失败:', error);
    process.exit(1);
  });
}

module.exports = initDatabase;
