const express = require('express');
const router = express.Router();
const { audit: auditModel } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { all, get } = require('../models/database');

/**
 * 生成本地日期键
 */
function nowLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// GET /api/audit-logs - Query audit logs with filters and pagination
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const action = req.query.action ? String(req.query.action).trim() : null;
    const resourceType = req.query.resource_type ? String(req.query.resource_type).trim() : null;
    const startDate = req.query.start_date ? String(req.query.start_date).trim() : null;
    const endDate = req.query.end_date ? String(req.query.end_date).trim() : null;

    const clauses = [];
    const params = [];

    if (userId) {
      clauses.push('user_id = ?');
      params.push(userId);
    }
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    if (resourceType) {
      clauses.push('resource_type = ?');
      params.push(resourceType);
    }
    if (startDate) {
      clauses.push('created_at >= ?');
      params.push(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      clauses.push('created_at <= ?');
      params.push(`${endDate}T23:59:59.999Z`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const total = get(`SELECT COUNT(*) AS count FROM audit_logs ${where}`, params).count;
    const logs = all(
      `SELECT * FROM audit_logs ${where} ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      ok: true,
      logs: logs.map(log => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: '查询审计日志失败。' });
  }
});

// GET /api/audit-logs/export - Export audit logs as CSV
router.get('/export', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const action = req.query.action ? String(req.query.action).trim() : null;
    const resourceType = req.query.resource_type ? String(req.query.resource_type).trim() : null;
    const startDate = req.query.start_date ? String(req.query.start_date).trim() : null;
    const endDate = req.query.end_date ? String(req.query.end_date).trim() : null;

    const clauses = [];
    const params = [];

    if (userId) {
      clauses.push('user_id = ?');
      params.push(userId);
    }
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    if (resourceType) {
      clauses.push('resource_type = ?');
      params.push(resourceType);
    }
    if (startDate) {
      clauses.push('created_at >= ?');
      params.push(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      clauses.push('created_at <= ?');
      params.push(`${endDate}T23:59:59.999Z`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const logs = all(
      `SELECT * FROM audit_logs ${where} ORDER BY datetime(created_at) DESC LIMIT 10000`,
      params
    );

    // 生成CSV
    const csvHeader = 'ID,用户ID,用户名,角色,操作,资源类型,资源ID,详情,IP地址,User-Agent,创建时间\n';
    const csvRows = logs.map(log => {
      const details = log.details ? JSON.parse(log.details) : {};
      const detailsStr = JSON.stringify(details).replace(/"/g, '""');
      return [
        log.id,
        log.user_id || '',
        `"${log.username}"`,
        log.role,
        log.action,
        log.resource_type,
        log.resource_id || '',
        `"${detailsStr}"`,
        log.ip_address || '',
        `"${(log.user_agent || '').replace(/"/g, '""')}"`,
        log.created_at
      ].join(',');
    }).join('\n');

    const csv = '﻿' + csvHeader + csvRows; // BOM for Excel UTF-8 support
    const filename = `audit-logs-${nowLocalDateKey()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出审计日志失败。' });
  }
});

module.exports = router;
