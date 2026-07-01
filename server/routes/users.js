const express = require('express');
const router = express.Router();
const { user: userModel, session: sessionModel, audit: auditModel } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * 获取所有用户（管理员）
 */
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const users = userModel.getAllUsers();
    res.json({ ok: true, users });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败。' });
  }
});

/**
 * 创建用户（管理员）
 */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role = 'guest', displayName = '' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码。' });
  }
  if (password.length < 8 || password.length > 100) {
    return res.status(400).json({ error: '密码长度需为 8-100 个字符。' });
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: '密码需包含大写字母、小写字母和数字。' });
  }
  if (!['admin', 'editor', 'guest'].includes(role)) {
    return res.status(400).json({ error: '用户角色不合法。' });
  }

  // 检查用户名是否已存在
  if (userModel.usernameExists(username)) {
    return res.status(400).json({ error: '用户名已存在。' });
  }

  try {
    const newUser = userModel.createUser(username, password, role, req.user.id);

    // 如果有显示名称，更新它
    if (displayName) {
      userModel.updateUser(newUser.id, { display_name: displayName });
    }

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'create',
      resourceType: 'user',
      resourceId: String(newUser.id),
      details: JSON.stringify({ username, role }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true, user: userModel.getUserById(newUser.id) });
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({ error: '创建用户失败。' });
  }
});

/**
 * 更新用户信息（管理员）
 */
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: '用户 ID 无效。' });
  const updates = {};

  if (req.body.displayName !== undefined) {
    updates.display_name = String(req.body.displayName).trim();
  }
  if (req.body.signature !== undefined) {
    updates.signature = String(req.body.signature).trim();
  }
  if (req.body.role !== undefined) {
    const role = String(req.body.role).trim();
    if (!['admin', 'editor', 'guest'].includes(role)) {
      return res.status(400).json({ error: '用户角色不合法。' });
    }
    updates.role = role;
  }
  if (req.body.password !== undefined) {
    const password = String(req.body.password);
    if (password.length < 8 || password.length > 100) {
      return res.status(400).json({ error: '密码长度需为 8-100 个字符。' });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: '密码需包含大写字母、小写字母和数字。' });
    }
    updates.password = password;
  }

  try {
    const existing = userModel.getUserById(userId);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在。' });
    }
    if (existing.role === 'admin' && existing.status === 'active') {
      if (updates.role && updates.role !== 'admin' && !userModel.hasOtherActiveAdmin(userId)) {
        return res.status(400).json({ error: '不能降级最后一个启用中的管理员。' });
      }
      if (updates.status === 'disabled' && !userModel.hasOtherActiveAdmin(userId)) {
        return res.status(400).json({ error: '不能禁用最后一个启用中的管理员。' });
      }
    }

    const passwordChanged = Boolean(updates.password);
    const updatedUser = userModel.updateUser(userId, updates);

    if (passwordChanged) {
      sessionModel.deleteUserSessions(userId);
    }

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'update',
      resourceType: 'user',
      resourceId: String(userId),
      details: JSON.stringify(Object.keys(updates)),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true, user: updatedUser });
  } catch (error) {
    console.error('更新用户失败:', error);
    res.status(500).json({ error: '更新用户失败。' });
  }
});

/**
 * 删除用户（管理员）
 */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: '用户 ID 无效。' });

  // 不能删除自己
  if (userId === req.user.id) {
    return res.status(400).json({ error: '不能删除自己的账号。' });
  }

  const user = userModel.getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在。' });
  }

  try {
    if (user.role === 'admin' && user.status === 'active' && !userModel.hasOtherActiveAdmin(userId)) {
      return res.status(400).json({ error: '不能删除最后一个启用中的管理员。' });
    }

    // 删除用户的所有会话
    sessionModel.deleteUserSessions(userId);

    // 删除用户
    userModel.deleteUser(userId);

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'delete',
      resourceType: 'user',
      resourceId: String(userId),
      details: JSON.stringify({ username: user.username }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ error: '删除用户失败。' });
  }
});

/**
 * 更新用户状态（启用/禁用）
 */
router.patch('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: '用户 ID 无效。' });
  const { status } = req.body;

  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: '状态值不合法。' });
  }

  // 不能禁用自己
  if (userId === req.user.id && status === 'disabled') {
    return res.status(400).json({ error: '不能禁用自己的账号。' });
  }

  try {
    const existing = userModel.getUserById(userId);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在。' });
    }
    if (existing.role === 'admin' && existing.status === 'active' && status === 'disabled' && !userModel.hasOtherActiveAdmin(userId)) {
      return res.status(400).json({ error: '不能禁用最后一个启用中的管理员。' });
    }

    const updatedUser = userModel.updateUser(userId, { status });

    if (!updatedUser) {
      return res.status(404).json({ error: '用户不存在。' });
    }

    // 如果禁用用户，删除其所有会话
    if (status === 'disabled') {
      sessionModel.deleteUserSessions(userId);
    }

    // 记录审计日志
    auditModel.createAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: status === 'active' ? 'enable' : 'disable',
      resourceType: 'user',
      resourceId: String(userId),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ ok: true, user: updatedUser });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({ error: '更新用户状态失败。' });
  }
});

/**
 * 踢出用户所有会话（管理员）
 */
router.delete('/:id/sessions', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: '用户 ID 无效。' });
  if (!userModel.getUserById(userId)) return res.status(404).json({ error: '用户不存在。' });
  sessionModel.deleteUserSessions(userId);
  auditModel.createAuditLog({
    userId: req.user.id, username: req.user.username, role: req.user.role,
    action: 'revoke_sessions', resourceType: 'user', resourceId: String(userId),
    ipAddress: req.ip, userAgent: req.get('user-agent'),
  });
  res.json({ ok: true });
});

module.exports = router;
