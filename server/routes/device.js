const express = require('express');
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction } = require('../database');

// 导入中间件
const { requireAuth, requireAdmin } = require('../middleware/auth');

// 导入工具函数
const { nowIso, randomId } = require('../utils/helpers');
const { logServerEvent } = require('../utils/logger');

// 导入服务
const { getDeviceList, getDeviceById } = require('../services/device');
const { deviceRowToItem } = require('../services/common');

// ========== 设备路由 ==========

// 获取设备列表
router.get('/devices', requireAuth, (req, res) => {
  res.json({ ok: true, items: getDeviceList(req.query || {}) });
});

// 获取设备详情
router.get('/devices/:id', requireAuth, (req, res) => {
  const id = String(req.params.id || '');
  const device = getDeviceById(id);
  if (!device) {
    return res.status(404).json({ error: '设备不存在。' });
  }
  res.json({ ok: true, item: device });
});

// 创建设备
router.post('/devices', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const assetNo = String(body.assetNo || '').trim();
  const status = String(body.status || 'available');
  const location = String(body.location || '').trim();
  const owner = String(body.owner || '').trim();
  const note = String(body.note || '').trim();
  if (!name || !category || !assetNo) {
    return res.status(400).json({ error: '请填写设备名称、类别和编号。' });
  }

  const item = {
    id: randomId('device'),
    name,
    category,
    asset_no: assetNo,
    status: ['available', 'borrowed', 'maintenance'].includes(status) ? status : 'available',
    location,
    owner,
    note,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  transaction(() => {
    runWrite(
      `INSERT INTO devices (id, name, category, asset_no, status, location, owner, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.name, item.category, item.asset_no, item.status, item.location, item.owner, item.note, item.created_at, item.updated_at],
    );
    logServerEvent('info', 'device_create', {
      method: req.method,
      path: req.originalUrl || req.url,
      role: req.user?.role || 'admin',
      deviceId: item.id,
      name: item.name,
    });
  });
  res.json({ ok: true, item: deviceRowToItem(item) });
});

// 更新设备
router.patch('/devices/:id', requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const existing = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
  if (!existing) {
    return res.status(404).json({ error: '设备不存在。' });
  }

  const body = req.body || {};
  const name = body.name !== undefined ? String(body.name || '').trim() : existing.name;
  const category = body.category !== undefined ? String(body.category || '').trim() : existing.category;
  const assetNo = body.assetNo !== undefined ? String(body.assetNo || '').trim() : existing.asset_no;
  const status = body.status !== undefined ? String(body.status || '').trim() : existing.status;
  const location = body.location !== undefined ? String(body.location || '').trim() : existing.location;
  const owner = body.owner !== undefined ? String(body.owner || '').trim() : existing.owner;
  const note = body.note !== undefined ? String(body.note || '').trim() : existing.note;
  const nextStatus = ['available', 'borrowed', 'maintenance'].includes(status) ? status : existing.status;

  transaction(() => {
    runWrite(
      `UPDATE devices
       SET name = ?, category = ?, asset_no = ?, status = ?, location = ?, owner = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [name, category, assetNo, nextStatus, location, owner, note, nowIso(), id],
    );
  });

  const updated = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
  res.json({ ok: true, item: deviceRowToItem(updated) });
});

// 删除设备
router.delete('/devices/:id', requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const existing = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
  if (!existing) {
    return res.status(404).json({ error: '设备不存在。' });
  }

  const activeBorrow = get(
    "SELECT * FROM borrow_requests WHERE device_id = ? AND status = 'approved' AND return_status != 'returned' LIMIT 1",
    [id],
  );
  if (activeBorrow) {
    return res.status(409).json({ error: '该设备正在借出中，无法删除。' });
  }

  transaction(() => {
    runWrite('DELETE FROM devices WHERE id = ?', [id]);
  });

  res.json({ ok: true });
});

module.exports = router;
