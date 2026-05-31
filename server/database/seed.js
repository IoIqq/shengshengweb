const { runWrite, get, transaction, persistDb, all } = require("./index");
const { createPasswordHash, verifyPassword } = require("../utils/crypto");
const { nowIso, createThumb, randomId } = require("../utils/helpers");
const { normalizePriority } = require("../utils/validators");
const { logServerEvent } = require("../utils/logger");

function setSetting(key, value) {
  runWrite(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? "")],
  );
}

function getSetting(key, fallback = "") {
  const row = get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

function createAdminUser(username, password) {
  const { salt, hash } = createPasswordHash(password || "admin123456");
  const now = nowIso();
  runWrite(
    `INSERT INTO users (username, password_hash, salt, role, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', ?, ?)`,
    [username, hash, salt, now, now],
  );
}

function defaultTeam() {
  const now = nowIso();
  return [
    {
      id: "team-1",
      name: "林晓妍",
      role: "内容统筹",
      note: "负责选题、审片和发布节奏",
      badge: "统",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 1,
    },
    {
      id: "team-2",
      name: "周浩然",
      role: "视频剪辑",
      note: "负责短视频包装和节奏优化",
      badge: "剪",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 2,
    },
    {
      id: "team-3",
      name: "陈佳宁",
      role: "视觉设计",
      note: "负责海报、封面和版式统一",
      badge: "设",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 3,
    },
    {
      id: "team-4",
      name: "宋思雨",
      role: "摄影采访",
      note: "负责现场拍摄与素材归档",
      badge: "摄",
      email: "",
      phone: "",
      status: "active",
      joined_at: now,
      order_index: 4,
    },
  ];
}

function defaultTodos() {
  return [
    { id: "todo-1", title: "确认下一期推文封面风格", priority: "高", done: false },
    { id: "todo-2", title: "整理服务器照片目录命名", priority: "中", done: false },
    { id: "todo-3", title: "补拍团课活动 3 张横版图", priority: "高", done: false },
    { id: "todo-4", title: "给视频片头统一片尾片头", priority: "低", done: true },
  ];
}

function defaultActivity() {
  return [
    {
      id: "act-1",
      title: "校园宣传片",
      meta: "已通过 · 3 分钟前 · 审片人：林晓然",
      detail: "进入发布排期，建议同步到公众号与视频号。",
      createdAt: nowIso(),
    },
    {
      id: "act-2",
      title: "采访现场组图",
      meta: "待审 · 18 分钟前 · 来自服务器照片",
      detail: "已同步到素材库，等待补拍特写。",
      createdAt: nowIso(),
    },
    {
      id: "act-3",
      title: "新生报到短视频",
      meta: "退回 · 35 分钟前 · 需要再剪一版",
      detail: "建议缩短片头和字幕停留时间。",
      createdAt: nowIso(),
    },
  ];
}

function defaultMedia() {
  return [
    {
      id: "media-1",
      kind: "photo",
      title: "团课封面：青春与信仰",
      source: "服务器 / 公众号 / 2026-05-18",
      source_type: "seed",
      source_path: null,
      author: "晓然",
      duration: "5184 × 3456",
      status: "待审",
      note: "封面图需要统一压暗一点，标题往左上挪，留白更足。",
      tags_json: JSON.stringify(["封面", "团课", "公众号"]),
      thumb: createThumb("团课封面", "#1f5a49", "#f6c453", "photo"),
      url: createThumb("团课封面", "#1f5a49", "#f6c453", "photo"),
      review_state: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-2",
      kind: "video",
      title: "开学季短视频：新生报到",
      source: "服务器 / 视频素材 / 2026-05-18",
      source_type: "seed",
      source_path: null,
      author: "浩然",
      duration: "02:16",
      status: "待审",
      note: "需要再核对字幕节奏，结尾 logo 放大 5%。",
      tags_json: JSON.stringify(["短视频", "开学季", "剪辑"]),
      thumb: createThumb("新生报到", "#163d32", "#ef6c4e", "video"),
      url: createThumb("新生报到", "#163d32", "#ef6c4e", "video"),
      review_state: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-3",
      kind: "photo",
      title: "思政主题海报出图",
      source: "服务器 / 平面设计 / 2026-05-17",
      source_type: "seed",
      source_path: null,
      author: "佳宁",
      duration: "4096 × 4096",
      status: "已通过",
      note: "构图稳定，颜色统一，适合直接投放。",
      tags_json: JSON.stringify(["海报", "平面", "投放"]),
      thumb: createThumb("主题海报", "#ef6c4e", "#fff0d1", "photo"),
      url: createThumb("主题海报", "#ef6c4e", "#fff0d1", "photo"),
      review_state: "approved",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "media-4",
      kind: "video",
      title: "访谈片头：老师讲思政",
      source: "服务器 / 访谈 / 2026-05-16",
      source_type: "seed",
      source_path: null,
      author: "子突",
      duration: "01:04",
      status: "退回",
      note: "片头可更快进入主题，降低标题停留时间。",
      tags_json: JSON.stringify(["访谈", "栏目", "修改"]),
      thumb: createThumb("老师访谈", "#4a8b3b", "#e2f0d9", "video"),
      url: createThumb("老师访谈", "#4a8b3b", "#e2f0d9", "video"),
      review_state: "rejected",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
}

function insertMediaRecord(record) {
  runWrite(
    `INSERT INTO media
      (id, kind, title, source, source_type, source_path, author, duration, status, note, tags_json, thumb, url, review_state, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.kind,
      record.title,
      record.source,
      record.source_type,
      record.source_path,
      record.author,
      record.duration,
      record.status,
      record.note,
      record.tags_json,
      record.thumb,
      record.url,
      record.review_state,
      record.created_at,
      record.updated_at,
    ],
  );
}

function seedTables(config) {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, SITE_TITLE, SITE_SUBTITLE, PUBLIC_URL } = config;

  if (!get("SELECT COUNT(*) AS count FROM users").count) {
    createAdminUser(ADMIN_USERNAME, ADMIN_PASSWORD);
  } else {
    const adminUser = get("SELECT * FROM users WHERE username = ? LIMIT 1", [ADMIN_USERNAME]);
    if (adminUser && !verifyPassword(ADMIN_PASSWORD, adminUser)) {
      const { salt, hash } = createPasswordHash(ADMIN_PASSWORD);
      runWrite("UPDATE users SET username = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?", [
        ADMIN_USERNAME,
        hash,
        salt,
        nowIso(),
        adminUser.id,
      ]);
      persistDb();
      logServerEvent("info", "admin_user_synced", {
        username: ADMIN_USERNAME,
        reason: "env_password_changed",
      });
    }
  }

  if (!get("SELECT COUNT(*) AS count FROM settings").count) {
    setSetting("siteTitle", SITE_TITLE);
    setSetting("siteSubtitle", SITE_SUBTITLE);
    setSetting("homeHeroMessage", "首页只保留最关键的摘要，方便快速进入工作状态。");
    setSetting("publicUrl", PUBLIC_URL);
    setSetting("syncMessage", "等待同步");
    setSetting("lastSyncAt", "");
  }

  if (!get("SELECT COUNT(*) AS count FROM team").count) {
    transaction(() => {
      for (const [index, item] of defaultTeam().entries()) {
        runWrite(
          `INSERT INTO team (id, name, role, note, badge, email, phone, status, joined_at, order_index, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.name, item.role, item.note, item.badge, item.email, item.phone, item.status, item.joined_at, index + 1, item.joined_at, item.joined_at],
        );
      }
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM media").count) {
    transaction(() => {
      defaultMedia().forEach((item) => {
        insertMediaRecord(item);
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM todos").count) {
    transaction(() => {
      const now = nowIso();
      defaultTodos().forEach((item) => {
        runWrite(
          `INSERT INTO todos (id, title, priority, done, due_date, assignee_id, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.title, normalizePriority(item.priority), item.done ? 1 : 0, null, null, null, now, now],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM activity").count) {
    transaction(() => {
      defaultActivity().forEach((item) => {
        runWrite(
          `INSERT INTO activity (id, title, meta, detail, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [item.id, item.title, item.meta, item.detail, item.createdAt || nowIso()],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM devices").count) {
    transaction(() => {
      const now = nowIso();
      const seedDevices = [
        { id: "device-1", name: "摄影机 A1", category: "摄影", asset_no: "DEV-001", status: "available", location: "资料室 A 架", owner: "王老师", note: "常用于活动拍摄", created_at: now, updated_at: now },
        { id: "device-2", name: "收音麦克风", category: "收音", asset_no: "DEV-002", status: "borrowed", location: "器材柜 2 层", owner: "张老师", note: "当前外借中", created_at: now, updated_at: now },
        { id: "device-3", name: "剪辑笔记本", category: "电脑", asset_no: "DEV-003", status: "maintenance", location: "办公室", owner: "李老师", note: "等待系统重装", created_at: now, updated_at: now },
      ];
      seedDevices.forEach((item) => {
        runWrite(
          `INSERT INTO devices (id, name, category, asset_no, status, location, owner, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.name, item.category, item.asset_no, item.status, item.location, item.owner, item.note, item.created_at, item.updated_at],
        );
      });
    });
    persistDb();
  }

  if (!get("SELECT COUNT(*) AS count FROM borrow_requests").count) {
    transaction(() => {
      const now = nowIso();
      runWrite(
        `INSERT INTO borrow_requests
          (id, applicant, device_id, purpose, borrow_at, expected_return_at, note, status, return_status, approved_by, approved_at, returned_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "borrow-1",
          "林晓然",
          "device-1",
          "校园活动拍摄",
          now,
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          "用于本周活动记录",
          "pending",
          "not_returned",
          "",
          "",
          "",
          now,
          now,
        ],
      );
    });
    persistDb();
  }
}

module.exports = {
  seedTables,
  setSetting,
  getSetting,
  insertMediaRecord,
};
