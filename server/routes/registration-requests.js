const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { registrationRequest: registrationRequestModel, user: userModel, audit: auditModel } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const ROLES = new Set(['admin', 'editor', 'guest']);

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '申请提交过于频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validateUsername(username) {
  return USERNAME_PATTERN.test(username);
}

router.post('/', registrationLimiter, (req, res) => {
  const body = req.body || {};
  const username = cleanText(body.username, 32);
  const displayName = cleanText(body.displayName, 50);
  const contact = cleanText(body.contact, 100);
  const reason = cleanText(body.reason, 300);

  if (!username || !displayName || !contact || !reason) {
    return res.status(400).json({ error: '请完整填写申请信息。' });
  }
  if (!validateUsername(username)) {
    return res.status(400).json({ error: '账号需为 3-32 位字母、数字、下划线、点或连字符。' });
  }
  try {
    if (userModel.usernameExists(username)) {
      return res.status(400).json({ error: '用户名已存在。' });
    }
    if (registrationRequestModel.hasPendingRegistrationRequest(username)) {
      return res.status(400).json({ error: '该账号已有待审核申请。' });
    }

    const request = registrationRequestModel.createRegistrationRequest({
      username,
      displayName,
      contact,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    auditModel.createAuditLog({
      userId: null,
      username,
      role: 'public',
      action: 'submit',
      resourceType: 'registration_request',
      resourceId: request.id,
      details: JSON.stringify({ contact }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ok: true, request: registrationRequestModel.registrationRequestRowToItem(request) });
  } catch (error) {
    console.error('提交注册申请失败:', error);
    res.status(500).json({ error: '提交申请失败。' });
  }
});

router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const requests = registrationRequestModel.getRegistrationRequests({ status: req.query.status || 'pending' });
    res.json({ ok: true, requests });
  } catch (error) {
    console.error('获取注册申请失败:', error);
    res.status(500).json({ error: '获取注册申请失败。' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const body = req.body || {};
  const action = String(body.action || '').trim();

  try {
    if (action === 'approve') {
      const role = cleanText(body.role || 'guest', 20);
      const password = String(body.password || '');
      const displayName = cleanText(body.displayName, 50);

      if (!ROLES.has(role)) {
        return res.status(400).json({ error: '用户角色不合法。' });
      }
      if (password.length < 6 || password.length > 100) {
        return res.status(400).json({ error: '初始密码长度需为 6-100 个字符。' });
      }

      const result = registrationRequestModel.approveRegistrationRequest(id, {
        role,
        password,
        displayName,
      }, req.user);

      auditModel.createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'approve',
        resourceType: 'registration_request',
        resourceId: id,
        details: JSON.stringify({ username: result.request.username, role, createdUserId: result.user.id }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.json({ ok: true, request: result.request, user: result.user });
    }

    if (action === 'reject') {
      const rejectReason = cleanText(body.rejectReason, 200);
      if (!rejectReason) {
        return res.status(400).json({ error: '请填写拒绝原因。' });
      }

      const request = registrationRequestModel.rejectRegistrationRequest(id, { rejectReason }, req.user);

      auditModel.createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'reject',
        resourceType: 'registration_request',
        resourceId: id,
        details: JSON.stringify({ username: request.username, rejectReason }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.json({ ok: true, request });
    }

    return res.status(400).json({ error: '审核操作不合法。' });
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('待审核') || error.message.includes('用户名已存在')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('处理注册申请失败:', error);
    return res.status(500).json({ error: '处理注册申请失败。' });
  }
});

module.exports = router;
