/**
 * DHCP 管理路由 — 地址池配置 / MAC绑定 / 启停 / 租约查看
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { audit: auditModel } = require('../models');
const dhcp = require('../services/dhcp-server');

// GET /api/dhcp/status — 运行状态 + 配置 + 绑定 + 租约
router.get('/status', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, ...dhcp.getStatus() });
  } catch (error) {
    res.status(500).json({ error: '获取 DHCP 状态失败。' });
  }
});

// PATCH /api/dhcp/config — 更新地址池/网关/DNS 等
router.patch('/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const cfg = dhcp.updateConfig(req.body || {});
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'dhcp_config', resourceType: 'dhcp', ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, config: cfg });
  } catch (error) {
    res.status(500).json({ error: '更新配置失败：' + (error.message || '') });
  }
});

// POST /api/dhcp/start — 启动 DHCP 服务
router.post('/start', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await dhcp.start();
    if (result.ok) {
      auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'dhcp_start', resourceType: 'dhcp', ipAddress: req.ip, userAgent: req.get('user-agent') });
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || '启动失败（可能需要管理员权限）' });
  }
});

// POST /api/dhcp/stop — 停止 DHCP 服务
router.post('/stop', requireAuth, requireAdmin, (req, res) => {
  try {
    const result = dhcp.stop();
    if (result.ok) {
      auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'dhcp_stop', resourceType: 'dhcp', ipAddress: req.ip, userAgent: req.get('user-agent') });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '停止失败。' });
  }
});

// GET /api/dhcp/reservations — 绑定列表
router.get('/reservations', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true, reservations: dhcp.getReservations() });
});

// POST /api/dhcp/reservations — 添加 MAC→IP 绑定
router.post('/reservations', requireAuth, requireAdmin, (req, res) => {
  try {
    const { mac, ip, hostname, note } = req.body || {};
    if (!mac || !ip) return res.status(400).json({ error: 'MAC 和 IP 不能为空' });
    const reservations = dhcp.addReservation(mac, ip, hostname, note);
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'dhcp_reservation_add', resourceType: 'dhcp', resourceId: `${mac}→${ip}`, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, reservations });
  } catch (error) {
    res.status(400).json({ error: error.message || '添加失败' });
  }
});

// DELETE /api/dhcp/reservations/:mac — 删除绑定
router.delete('/reservations/:mac', requireAuth, requireAdmin, (req, res) => {
  try {
    const reservations = dhcp.removeReservation(req.params.mac);
    auditModel.createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'dhcp_reservation_del', resourceType: 'dhcp', resourceId: req.params.mac, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ ok: true, reservations });
  } catch (error) {
    res.status(400).json({ error: error.message || '删除失败' });
  }
});

// POST /api/dhcp/detect — 检测网络中是否有 DHCP 服务器
router.post('/detect', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await dhcp.detect();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: '检测失败：' + (error.message || '') });
  }
});

module.exports = router;
