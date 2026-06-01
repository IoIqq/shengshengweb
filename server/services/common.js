const path = require('path');
const fs = require('fs');
const os = require('os');
const { all, get } = require('../database');
const { getSetting } = require('../database/seed');
const { countFilesRecursively } = require('../utils/helpers');
const config = require('../config');

// 数据转换函数
function mediaRowToItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    source: row.source,
    author: row.author,
    duration: row.duration,
    status: row.status,
    note: row.note,
    tags: JSON.parse(row.tags_json || '[]'),
    thumb: row.thumb,
    url: row.url,
    reviewState: row.review_state,
    uploadedAt: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deviceRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    assetNo: row.asset_no,
    status: row.status,
    location: row.location,
    owner: row.owner,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function borrowRequestRowToItem(row) {
  return {
    id: row.id,
    applicant: row.applicant,
    deviceId: row.device_id,
    deviceName: row.device_name,
    purpose: row.purpose,
    borrowAt: row.borrow_at,
    expectedReturnAt: row.expected_return_at,
    note: row.note,
    status: row.status,
    returnStatus: row.return_status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    returnedAt: row.returned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function todoRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    done: Boolean(row.done),
    dueDate: row.due_date || null,
    assigneeId: row.assignee_id || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function activityRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    meta: row.meta,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function teamRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    note: row.note,
    badge: row.badge,
    email: row.email || '',
    phone: row.phone || '',
    status: row.status || 'active',
    joinedAt: row.joined_at || '',
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function wishRowToItem(row) {
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    mood: row.mood || '',
    anonymous: Boolean(row.anonymous),
    createdAt: row.created_at,
  };
}

// 获取所有数据
function getAllMedia() {
  return all('SELECT * FROM media ORDER BY datetime(created_at) DESC').map(mediaRowToItem);
}

function getAllTodos() {
  return all('SELECT * FROM todos ORDER BY datetime(created_at) DESC').map(todoRowToItem);
}

function getAllActivity() {
  return all('SELECT * FROM activity ORDER BY datetime(created_at) DESC').map(activityRowToItem);
}

function getAllTeam() {
  return all('SELECT * FROM team ORDER BY order_index ASC, datetime(created_at) ASC').map(teamRowToItem);
}

function getAllDevices() {
  return all('SELECT * FROM devices ORDER BY datetime(created_at) DESC').map(deviceRowToItem);
}

function getAllBorrowRequests() {
  return all(`
    SELECT borrow_requests.*, devices.name AS device_name
    FROM borrow_requests
    LEFT JOIN devices ON devices.id = borrow_requests.device_id
    ORDER BY datetime(borrow_requests.created_at) DESC
  `).map(borrowRequestRowToItem);
}

// Dashboard 数据
function getDashboard() {
  const deviceCount = get('SELECT COUNT(*) AS count FROM devices').count;
  const borrowOpenCount = get("SELECT COUNT(*) AS count FROM borrow_requests WHERE status = 'pending'").count;
  return {
    counts: {
      all: get('SELECT COUNT(*) AS count FROM media').count,
      pending: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'pending'").count,
      approved: get("SELECT COUNT(*) AS count FROM media WHERE review_state = 'approved'").count,
      photo: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'photo'").count,
      video: get("SELECT COUNT(*) AS count FROM media WHERE kind = 'video'").count,
      todoOpen: get('SELECT COUNT(*) AS count FROM todos WHERE done = 0').count,
      devices: deviceCount,
      borrowOpen: borrowOpenCount,
    },
    recent: all('SELECT * FROM activity ORDER BY datetime(created_at) DESC LIMIT 8').map(activityRowToItem),
    syncMessage: getSetting('syncMessage', '等待同步'),
    lastSyncAt: getSetting('lastSyncAt', ''),
  };
}

// 设置数据
function getSettings() {
  return {
    siteTitle: getSetting('siteTitle', config.SITE_TITLE),
    siteSubtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
    homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
    publicUrl: getSetting('publicUrl', config.PUBLIC_URL),
    adminUsername: getSetting('adminUsername', config.ADMIN_USERNAME),
    syncMessage: getSetting('syncMessage', '等待同步'),
    lastSyncAt: getSetting('lastSyncAt', ''),
  };
}

// 系统信息
function getSystemInfo() {
  return {
    databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, '/'),
    uploadDir: 'server/uploads',
    inboxDir: 'server/uploads/inbox',
    inboxAutoScanSeconds: config.AUTO_SCAN_SECONDS,
    maxUploadMb: config.MAX_UPLOAD_MB,
  };
}

// Bootstrap 数据
function buildBootstrap(user) {
  return {
    user,
    publicConfig: {
      siteTitle: getSetting('siteTitle', config.SITE_TITLE),
      siteSubtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
      homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
      publicUrl: getSetting('publicUrl', config.PUBLIC_URL),
    },
    site: {
      title: getSetting('siteTitle', config.SITE_TITLE),
      subtitle: getSetting('siteSubtitle', config.SITE_SUBTITLE),
      homeHeroMessage: getSetting('homeHeroMessage', '首页只保留最关键的摘要，方便快速进入工作状态。'),
    },
    system: getSystemInfo(),
    settings: getSettings(),
    dashboard: getDashboard(),
    media: getAllMedia(),
    todos: getAllTodos(),
    activity: getAllActivity(),
    team: getAllTeam(),
    devices: getAllDevices(),
    borrowRequests: getAllBorrowRequests(),
  };
}

// 备份摘要
function buildBackupSummary() {
  const databaseExists = fs.existsSync(config.DB_PATH);
  const uploadFiles = countFilesRecursively(config.UPLOAD_DIR);
  const mediaCount = get('SELECT COUNT(*) AS count FROM media').count;
  const todoCount = get('SELECT COUNT(*) AS count FROM todos').count;
  const activityCount = get('SELECT COUNT(*) AS count FROM activity').count;
  return {
    generatedAt: new Date().toISOString(),
    databasePath: path.relative(config.ROOT_DIR, config.DB_PATH).replace(/\\/g, '/'),
    databaseExists,
    uploadDir: 'server/uploads',
    uploadFiles,
    counts: {
      media: mediaCount,
      todos: todoCount,
      activity: activityCount,
    },
  };
}

// 完整备份
function buildFullBackup() {
  const summary = buildBackupSummary();
  return {
    ...summary,
    exportVersion: 2,
    data: {
      settings: getSettings(),
      team: getAllTeam(),
      media: getAllMedia(),
      todos: getAllTodos(),
      activity: getAllActivity(),
      devices: getAllDevices(),
      borrowRequests: getAllBorrowRequests(),
      wishes: all('SELECT * FROM wishes ORDER BY datetime(created_at) DESC').map(wishRowToItem),
    },
  };
}

// 获取局域网IP地址
function getLanIpAddresses() {
  const seen = new Set();
  const addresses = [];

  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (!info || info.family !== 'IPv4' || info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      addresses.push(info.address);
    }
  }

  return addresses.sort((left, right) => left.localeCompare(right));
}

module.exports = {
  mediaRowToItem,
  deviceRowToItem,
  borrowRequestRowToItem,
  todoRowToItem,
  activityRowToItem,
  teamRowToItem,
  wishRowToItem,
  getAllMedia,
  getAllTodos,
  getAllActivity,
  getAllTeam,
  getAllDevices,
  getAllBorrowRequests,
  getDashboard,
  getSettings,
  getSystemInfo,
  buildBootstrap,
  buildBackupSummary,
  buildFullBackup,
  getLanIpAddresses,
};
