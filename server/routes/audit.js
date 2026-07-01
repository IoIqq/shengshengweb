const express = require('express');
const router = express.Router();
const { audit: auditModel } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

function nowLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildAuditFilters(query) {
  return {
    userId: query.user_id ? (isNaN(parseInt(query.user_id, 10)) ? null : parseInt(query.user_id, 10)) : null,
    action: query.action ? String(query.action).trim() : null,
    resourceType: query.resource_type ? String(query.resource_type).trim() : null,
    startDate: query.start_date ? `${String(query.start_date).trim()}T00:00:00.000Z` : null,
    endDate: query.end_date ? `${String(query.end_date).trim()}T23:59:59.999Z` : null,
  };
}

function escapeCsv(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

// GET /api/audit-logs - Query audit logs with filters and pagination
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const filters = buildAuditFilters(req.query);
    const offset = (page - 1) * limit;

    const total = auditModel.getAuditLogCount(filters);
    const logs = auditModel.getAuditLogs({ ...filters, limit, offset });

    res.json({
      ok: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: '查询审计日志失败。' });
  }
});

// GET /api/audit-logs/export - Export audit logs as CSV
router.get('/export', requireAuth, requireAdmin, (req, res) => {
  try {
    const logs = auditModel.getAuditLogsForExport(buildAuditFilters(req.query));
    const csvHeader = 'ID,用户ID,用户名,角色,操作,资源类型,资源ID,详情,IP地址,User-Agent,创建时间\n';
    const csvRows = logs.map((log) => [
      log.id,
      log.user_id || '',
      escapeCsv(log.username),
      log.role,
      log.action,
      log.resource_type,
      log.resource_id || '',
      escapeCsv(JSON.stringify(log.details || {})),
      log.ip_address || '',
      escapeCsv(log.user_agent),
      log.created_at,
    ].join(',')).join('\n');

    const csv = '﻿' + csvHeader + csvRows;
    const filename = `audit-logs-${nowLocalDateKey()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出审计日志失败。' });
  }
});

module.exports = router;
