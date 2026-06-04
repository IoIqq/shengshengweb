const express = require('express');
const router = express.Router();
const { borrow: borrowModel } = require('../models');
const { run, saveDatabase } = require('../models/database');
const { requireAuth, requireEditor, requireAdmin } = require('../middleware/auth');
const { nowIso } = require('../utils');

// Rate limiter for borrow requests
const rateLimit = require('express-rate-limit');
const borrowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '借出申请提交过于频繁,请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

function logBorrowActivity(title, meta, detail) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`act-${timestamp}-${random}`, title, meta, detail, nowIso()],
  );
  saveDatabase();
}

// GET /api/borrow-requests - Get borrow request list with filters
router.get('/', requireAuth, (req, res) => {
  try {
    const items = borrowModel.getBorrowRequestList(req.query || {});
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ error: '获取借用申请列表失败。' });
  }
});

// GET /api/borrow-requests/overdue - Get overdue borrow requests
router.get('/overdue', requireAuth, (req, res) => {
  try {
    const items = borrowModel.getOverdueBorrows();
    res.json({ ok: true, items, count: items.length });
  } catch (error) {
    res.status(500).json({ error: '获取逾期列表失败。' });
  }
});

// GET /api/borrow-requests/stats - Get borrow statistics
router.get('/stats', requireAuth, (req, res) => {
  try {
    const stats = borrowModel.getBorrowStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ error: '获取借出统计失败。' });
  }
});

// GET /api/borrow-requests/:id - Get single borrow request
router.get('/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const item = borrowModel.getBorrowRequestById(id);

    if (!item) {
      return res.status(404).json({ error: '借出申请不存在。' });
    }

    res.json({ ok: true, item: borrowModel.borrowRequestRowToItem(item) });
  } catch (error) {
    res.status(500).json({ error: '获取借用申请失败。' });
  }
});

// POST /api/borrow-requests - Create borrow request
router.post('/', borrowLimiter, requireAuth, requireEditor, (req, res) => {
  try {
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

    const request = borrowModel.createBorrowRequest({
      applicant,
      device_id: deviceId,
      purpose,
      borrow_at: borrowAt,
      expected_return_at: expectedReturnAt,
      note,
    });

    const item = borrowModel.borrowRequestRowToItem(request);
    logBorrowActivity('借用申请', req.user?.username || 'unknown', `${applicant} 申请借用 ${item.deviceName || deviceId}`);
    res.json({ ok: true, item });
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: '创建借用申请失败。' });
  }
});

// PATCH /api/borrow-requests/:id - Update borrow request (approve/reject/return)
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const body = req.body || {};

    const updates = {};
    if (body.status !== undefined) {
      updates.status = String(body.status || '').trim();
    }
    if (body.returnStatus !== undefined) {
      updates.returnStatus = String(body.returnStatus || '').trim();
    }

    const approvedBy = req.user?.username || 'admin';
    const updated = borrowModel.updateBorrowRequest(id, updates, approvedBy);
    const item = borrowModel.borrowRequestRowToItem(updated);

    if (updates.status === 'approved') {
      logBorrowActivity('借用审核', approvedBy, `${item.applicant} 的 ${item.deviceName || item.deviceId} 借用申请已通过`);
    } else if (updates.status === 'rejected') {
      logBorrowActivity('借用审核', approvedBy, `${item.applicant} 的 ${item.deviceName || item.deviceId} 借用申请已拒绝`);
    } else if (updates.returnStatus === 'returned') {
      logBorrowActivity('设备归还', approvedBy, `${item.applicant} 已归还 ${item.deviceName || item.deviceId}`);
    }

    res.json({ ok: true, item });
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('待审') || error.message.includes('已通过') || error.message.includes('不可借出') || error.message.includes('归还')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: '更新借用申请失败。' });
  }
});

// DELETE /api/borrow-requests/:id - Delete borrow request
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const existing = borrowModel.getBorrowRequestById(id);
    if (!existing) {
      return res.status(404).json({ error: '借出申请不存在。' });
    }
    const { run: dbRun, saveDatabase } = require('../models/database');
    dbRun('DELETE FROM borrow_requests WHERE id = ?', [id]);
    saveDatabase();
    logBorrowActivity('借用记录删除', req.user?.username || 'unknown', `${existing.applicant} 的借用记录已删除`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: '删除借用申请失败。' });
  }
});

module.exports = router;
