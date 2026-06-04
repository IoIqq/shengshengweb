const express = require('express');
const router = express.Router();
const { team: teamModel } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Rate limiter for team writes
const rateLimit = require('express-rate-limit');
const teamWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '团队成员变更过于频繁,请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

function normalizeGroups(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function buildMemberPayload(body, name = '') {
  return {
    name,
    role: String(body.role || '').trim(),
    note: String(body.note || '').trim(),
    badge: String(body.badge || '').trim() || (name ? name.charAt(0) : ''),
    email: String(body.email || '').trim(),
    phone: String(body.phone || '').trim(),
    studentId: String(body.studentId || '').trim(),
    grade: String(body.grade || '').trim(),
    major: String(body.major || '').trim(),
    skills: String(body.skills || '').trim(),
    groups: normalizeGroups(body.groups),
    bio: String(body.bio || '').trim(),
    partyJoinAt: String(body.partyJoinAt || '').trim(),
    status: ['active', 'leave', 'inactive'].includes(body.status) ? body.status : 'active',
    joinedAt: String(body.joinedAt || '').trim(),
  };
}

// GET /api/team - Get team member list with filters
router.get('/', requireAuth, (req, res) => {
  try {
    const items = teamModel.getTeamList(req.query || {});
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ error: '获取团队成员列表失败。' });
  }
});

// GET /api/team/:id/contribution - Get member contribution stats
router.get('/:id/contribution', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const stats = teamModel.getMemberContributionStats(id);
    if (!stats) {
      return res.status(404).json({ error: '团队成员不存在。' });
    }
    res.json({ ok: true, ...stats });
  } catch (error) {
    res.status(500).json({ error: '获取成员贡献统计失败。' });
  }
});

// POST /api/team - Create team member
router.post('/', teamWriteLimiter, requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const role = String(body.role || '').trim();

    if (!name || !role) {
      return res.status(400).json({ error: '请填写成员姓名和角色。' });
    }

    const member = teamModel.createTeamMember(buildMemberPayload({ ...body, role }, name));
    res.json({ ok: true, item: teamModel.teamRowToItem(member) });
  } catch (error) {
    res.status(500).json({ error: '创建团队成员失败。' });
  }
});

// PATCH /api/team/:id - Update team member
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const body = req.body || {};

    const updates = {};
    if (body.name !== undefined) updates.name = String(body.name || '').trim();
    if (body.role !== undefined) updates.role = String(body.role || '').trim();
    if (body.note !== undefined) updates.note = String(body.note || '').trim();
    if (body.badge !== undefined) updates.badge = String(body.badge || '').trim();
    if (body.email !== undefined) updates.email = String(body.email || '').trim();
    if (body.phone !== undefined) updates.phone = String(body.phone || '').trim();
    if (body.studentId !== undefined) updates.studentId = String(body.studentId || '').trim();
    if (body.grade !== undefined) updates.grade = String(body.grade || '').trim();
    if (body.major !== undefined) updates.major = String(body.major || '').trim();
    if (body.skills !== undefined) updates.skills = String(body.skills || '').trim();
    if (body.groups !== undefined) updates.groups = normalizeGroups(body.groups);
    if (body.bio !== undefined) updates.bio = String(body.bio || '').trim();
    if (body.partyJoinAt !== undefined) updates.partyJoinAt = String(body.partyJoinAt || '').trim();
    if (body.status !== undefined) updates.status = body.status;
    if (body.joinedAt !== undefined) updates.joinedAt = String(body.joinedAt || '').trim();

    const updated = teamModel.updateTeamMember(id, updates);

    if (!updated) {
      return res.status(404).json({ error: '团队成员不存在。' });
    }

    res.json({ ok: true, item: teamModel.teamRowToItem(updated) });
  } catch (error) {
    res.status(500).json({ error: '更新团队成员失败。' });
  }
});

// DELETE /api/team/:id - Delete team member
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    teamModel.deleteTeamMember(id);
    res.json({ ok: true });
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: '删除团队成员失败。' });
  }
});

// PATCH /api/team/:id/order - Update team member order
router.patch('/:id/order', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const newOrder = Number(req.body?.orderIndex);

    const items = teamModel.updateTeamOrder(id, newOrder);
    res.json({ ok: true, items });
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('排序值')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: '更新排序失败。' });
  }
});

module.exports = router;
