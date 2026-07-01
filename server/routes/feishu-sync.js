/**
 * 飞书同步管理路由（全部 requireAuth + requireAdmin）
 *   GET  /api/feishu-sync/status   —— 同步状态总览
 *   POST /api/feishu-sync/run      —— 手动触发一次同步
 *   GET  /api/feishu-sync/errors   —— 匹配失败的行列表（设备名找不到等）
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { audit: auditModel, feishuSync: syncModel } = require('../models');
const feishuSyncService = require('../services/feishu-sync');
const config = require('../config');

// GET /api/feishu-sync/status
router.get('/status', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, ...feishuSyncService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: '获取同步状态失败。' });
  }
});

// POST /api/feishu-sync/run —— 手动触发一次同步
router.post('/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!config.FEISHU.enabled) {
      return res.status(400).json({ error: '飞书同步未启用，请先在 .env 配置 FEISHU_* 并设 FEISHU_SYNC_ENABLED=1。' });
    }
    const result = await feishuSyncService.runSync();
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'feishu_sync_run',
      resourceType: 'feishu',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: '同步失败：' + (error.message || '') });
  }
});

// GET /api/feishu-sync/errors —— 匹配失败的行
router.get('/errors', requireAuth, requireAdmin, (req, res) => {
  try {
    const errors = syncModel.listErrors().map((e) => ({
      recordId: e.record_id,
      borrowRequestId: e.borrow_request_id,
      error: e.error,
      updatedAt: e.updated_at,
    }));
    res.json({ ok: true, errors });
  } catch (error) {
    res.status(500).json({ error: '获取异常列表失败。' });
  }
});

module.exports = router;
