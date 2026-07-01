/**
 * 文件浏览路由 — 全盘文件管理器后端
 *
 * 安全：所有路径经 normalizePath 规范化 + 盘符白名单（Windows A:-Z:），
 * 拒绝含 .. 的相对遍历。所有端点 requireAuth + requireAdmin。
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { audit: auditModel } = require('../models');

const MAX_LIST = 2000; // 单次列目录上限，防止超长目录卡死

/** 规范化并校验路径：拒绝 null byte、强制盘符根（Windows） */
function safePath(input) {
  if (!input || typeof input !== 'string') return null;
  let p = input.replace(/\0/g, '').trim();
  if (!p) return null;
  // 统一正斜杠后 resolve，再校验根
  p = path.resolve(p.replace(/\//g, path.sep));
  if (process.platform === 'win32') {
    // 必须形如 C:\ ...
    if (!/^[A-Za-z]:[\\/]/.test(p)) return null;
  } else {
    if (!p.startsWith('/')) return null;
  }
  // resolve 已消除 ..，但二次确认
  if (p.includes('..')) return null;
  return p;
}

function toDisplay(p) {
  return p.replace(/\\/g, '/');
}

function fmtSize(bytes) {
  if (bytes == null || isNaN(bytes)) return null;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// GET /api/files/drives — 可用盘符
router.get('/drives', requireAuth, requireAdmin, (req, res) => {
  try {
    const drives = [];
    if (process.platform === 'win32') {
      for (let code = 65; code <= 90; code++) {
        const letter = String.fromCharCode(code);
        const root = `${letter}:\\`;
        if (fs.existsSync(root)) {
          let label = letter + ':';
          if (typeof fs.statfsSync === 'function') {
            try {
              const s = fs.statfsSync(root);
              const bs = Number(s.bsize || s.frsize || 0);
              const total = Number(s.blocks || 0) * bs;
              const free = Number(s.bavail || s.bfree || 0) * bs;
              if (total > 0) {
                drives.push({ root: `${letter}:/`, label, totalBytes: total, freeBytes: free, usedBytes: Math.max(0, total - free), usedPercent: Math.round((Math.max(0, total - free) / total) * 1000) / 10 });
                continue;
              }
            } catch (_) {}
          }
          drives.push({ root: `${letter}:/`, label });
        }
      }
    } else {
      drives.push({ root: '/', label: '/' });
    }
    res.json({ ok: true, drives });
  } catch (error) {
    res.status(500).json({ error: '获取盘符失败。' });
  }
});

// GET /api/files/list?path= — 列目录
router.get('/list', requireAuth, requireAdmin, async (req, res) => {
  const dir = safePath(req.query.path);
  if (!dir) return res.status(400).json({ error: '路径不合法。' });

  try {
    const stat = await fsp.stat(dir);
    if (!stat.isDirectory()) return res.status(400).json({ error: '目标不是文件夹。' });

    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const items = [];
    for (const e of entries.slice(0, MAX_LIST)) {
      // 跳过隐藏系统文件（可选，保留以透明）
      const full = path.join(dir, e.name);
      try {
        const st = await fsp.stat(full);
        items.push({
          name: e.name,
          path: toDisplay(full),
          isDir: e.isDirectory(),
          size: e.isDirectory() ? null : st.size,
          sizeText: e.isDirectory() ? null : fmtSize(st.size),
          mtime: st.mtime.toISOString(),
          ext: e.isDirectory() ? null : path.extname(e.name).toLowerCase().slice(1),
        });
      } catch (_) {
        // 无权限读取的文件跳过
      }
    }
    // 文件夹优先，再按名称排序
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-CN') : a.isDir ? -1 : 1));
    res.json({ ok: true, path: toDisplay(dir), parent: toDisplay(path.dirname(dir)), items, truncated: entries.length > MAX_LIST });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: '路径不存在。' });
    if (error.code === 'EACCES') return res.status(403).json({ error: '无权限访问该目录。' });
    res.status(500).json({ error: '读取目录失败。' });
  }
});

// GET /api/files/download?path= — 下载文件
router.get('/download', requireAuth, requireAdmin, (req, res) => {
  const file = safePath(req.query.path);
  if (!file) return res.status(400).json({ error: '路径不合法。' });
  try {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) return res.status(400).json({ error: '不能下载文件夹。' });
    res.download(file, path.basename(file));
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: '文件不存在。' });
    res.status(500).json({ error: '下载失败。' });
  }
});

// POST /api/files/mkdir — 建文件夹
router.post('/mkdir', requireAuth, requireAdmin, (req, res) => {
  const parent = safePath(req.body?.path);
  const name = String(req.body?.name || '').trim();
  if (!parent || !name) return res.status(400).json({ error: '缺少路径或名称。' });
  if (/[<>:"/\\|?*]/.test(name)) return res.status(400).json({ error: '名称含非法字符。' });
  const target = path.join(parent, name);
  if (fs.existsSync(target)) return res.status(409).json({ error: '已存在同名项。' });
  try {
    fs.mkdirSync(target, { recursive: false });
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'file_mkdir', resourceType: 'file', resourceId: toDisplay(target), ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, path: toDisplay(target) });
  } catch (error) {
    res.status(500).json({ error: '创建失败：' + (error.message || '') });
  }
});

// POST /api/files/rename — 重命名/移动
router.post('/rename', requireAuth, requireAdmin, (req, res) => {
  const oldPath = safePath(req.body?.oldPath);
  const newPath = safePath(req.body?.newPath);
  if (!oldPath || !newPath) return res.status(400).json({ error: '路径不合法。' });
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: '源路径不存在。' });
  if (fs.existsSync(newPath)) return res.status(409).json({ error: '目标已存在。' });
  try {
    fs.renameSync(oldPath, newPath);
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'file_rename', resourceType: 'file', resourceId: `${toDisplay(oldPath)} -> ${toDisplay(newPath)}`, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, path: toDisplay(newPath) });
  } catch (error) {
    res.status(500).json({ error: '重命名失败。' });
  }
});

// DELETE /api/files?path= — 删除文件/空文件夹
router.delete('/', requireAuth, requireAdmin, (req, res) => {
  const target = safePath(req.query.path);
  if (!target) return res.status(400).json({ error: '路径不合法。' });
  // 保护盘符根
  if (target === path.parse(target).root || /^[A-Za-z]:[\\/]$/.test(target)) {
    return res.status(400).json({ error: '不能删除盘符根目录。' });
  }
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, maxRetries: 2 });
    } else {
      fs.unlinkSync(target);
    }
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'file_delete', resourceType: 'file', resourceId: toDisplay(target), ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: '路径不存在。' });
    res.status(500).json({ error: '删除失败：' + (error.message || '') });
  }
});

// POST /api/files/upload — 多文件上传（multipart）
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dest = safePath(req.body?.path);
      if (!dest) return cb(new Error('目标路径不合法。'));
      try { fs.mkdirSync(dest, { recursive: true }); } catch (_) {}
      cb(null, dest);
    },
    filename(req, file, cb) {
      // 保留原文件名，冲突则加后缀
      const dest = safePath(req.body?.path);
      const base = path.basename(String(file.originalname || 'file').replace(/[<>:"|?*]/g, '_'));
      let name = base;
      let i = 1;
      while (dest && fs.existsSync(path.join(dest, name))) {
        const ext = path.extname(base);
        name = `${path.basename(base, ext)} (${i})${ext}`;
        i++;
      }
      cb(null, name);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 20 }, // 单文件 500MB，最多 20 个
});

router.post('/upload', requireAuth, requireAdmin, upload.array('files', 20), (req, res) => {
  const files = (req.files || []).map((f) => ({ name: f.filename, size: f.size }));
  if (files.length > 0) {
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'file_upload', resourceType: 'file', resourceId: `${req.body?.path} (${files.length} 个文件)`, ipAddress: req.ip, userAgent: req.get('user-agent') });
  }
  res.json({ ok: true, files });
});

module.exports = router;
