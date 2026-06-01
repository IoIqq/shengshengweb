const express = require('express');
const router = express.Router();

// 导入数据库操作
const { get, runWrite, transaction } = require('../database');

// 导入中间件
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { borrowLimiter } = require('../middleware/rateLimiter');

// 导入工具函数
const { nowIso, randomId } = require('../utils/helpers');

// 导入服务
const { getBorrowRequestList, getBorrowRequestById } = require('../services/device');
const { borrowRequestRowToItem } = require('../services/common');

// ========== 借用路由 ==========

// 获取借用申请列表
router.get('/borrow-requests', requireAuth, (req, res) => {
  res.json({ ok: true, items: getBorrowRequestList(req.query || {}) });
});

// 获取借用申请详情
router.get('/borrow-requests/:id', requireAuth, (req, res) => {
  const id = String(req.params.id || '');
  const item = getBorrowRequestById(id);
  if (!item) {
    return res.status(404).json({ error: '借出申请不存在。' });
  }
  res.json({ ok: true, item });
});

// 创建借用申请
router.post('/borrow-requests', borrowLimiter, requireAuth, (req, res) => {
  const body = req.body || {};
  const applicant = String(body.applicant || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const purpose = String(body.purpose || '').trim();
  const borrowAt = String(body.borrowAt || '').trim();
  const expectedReturnAt = String(body.expectedReturnAt || '').trim();
  const note = String(body.note || '').trim();
  if (!applicant || !deviceId || !purpose || !borrowAt || !expectedReturnAt) {
    return res.status(400).json({ error: '请把借出申请信息填写完整。' });
  }

  const device = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [deviceId]);
  if (!device) {
    return res.status(404).json({ error: '申请设备不存在。' });
  }

  const item = {
    id: randomId('borrow'),
    applicant,
    device_id: deviceId,
    purpose,
    borrow_at: borrowAt,
    expected_return_at: expectedReturnAt,
    note,
    status: 'pending',
    return_status: 'not_returned',
    approved_by: '',
    approved_at: '',
    returned_at: '',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  transaction(() => {
    runWrite(
      `INSERT INTO borrow_requests
        (id, applicant, device_id, purpose, borrow_at, expected_return_at, note, status, return_status, approved_by, approved_at, returned_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.applicant, item.device_id, item.purpose, item.borrow_at,
        item.expected_return_at, item.note, item.status, item.return_status,
        item.approved_by, item.approved_at, item.returned_at, item.created_at, item.updated_at,
      ],
    );
  });

  res.json({ ok: true, item: borrowRequestRowToItem({ ...item, device_name: device.name }) });
});

// 更新借用申请（审批/归还）
router.patch('/borrow-requests/:id', requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const existing = get(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     WHERE borrow_requests.id = ? LIMIT 1`,
    [id],
  );
  if (!existing) {
    return res.status(404).json({ error: '借出申请不存在。' });
  }

  const body = req.body || {};
  const nextStatus = body.status ? String(body.status || '').trim() : existing.status;
  const nextReturnStatus = body.returnStatus ? String(body.returnStatus || '').trim() : existing.return_status;
  const now = nowIso();
  const device = get('SELECT * FROM devices WHERE id = ? LIMIT 1', [existing.device_id]);

  if (body.status === 'approved') {
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: '只有待审申请才能通过。' });
    }
    if (!device) {
      return res.status(404).json({ error: '关联设备不存在。' });
    }
    if (device.status !== 'available') {
      return res.status(409).json({ error: '该设备当前不可借出。' });
    }
  }

  if (body.status === 'rejected' && existing.status !== 'pending') {
    return res.status(409).json({ error: '只有待审申请才能拒绝。' });
  }

  if (body.returnStatus === 'returned') {
    if (existing.status !== 'approved') {
      return res.status(409).json({ error: '只有已通过的申请才能归还。' });
    }
    if (existing.return_status === 'returned') {
      return res.status(409).json({ error: '该申请已经完成归还。' });
    }
  }

  transaction(() => {
    if (body.status === 'approved') {
      runWrite(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [nextStatus, req.user?.username || 'admin', now, now, id],
      );
      runWrite('UPDATE devices SET status = ?, updated_at = ? WHERE id = ?', ['borrowed', now, existing.device_id]);
    } else if (body.status === 'rejected') {
      runWrite(
        'UPDATE borrow_requests SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [nextStatus, req.user?.username || 'admin', now, now, id],
      );
    } else if (body.returnStatus === 'returned') {
      runWrite(
        'UPDATE borrow_requests SET return_status = ?, returned_at = ?, updated_at = ? WHERE id = ?',
        [nextReturnStatus, now, now, id],
      );
      runWrite('UPDATE devices SET status = ?, updated_at = ? WHERE id = ?', ['available', now, existing.device_id]);
    }
  });

  const updated = get(
    `SELECT borrow_requests.*, devices.name AS device_name
     FROM borrow_requests
     LEFT JOIN devices ON devices.id = borrow_requests.device_id
     WHERE borrow_requests.id = ? LIMIT 1`,
    [id],
  );
  res.json({ ok: true, item: borrowRequestRowToItem(updated) });
});

module.exports = router;
