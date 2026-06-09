const { logServerEvent } = require('./logger');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

let scheduler = null;

function runMaintenanceCycle(models) {
  const { session, audit, activity } = models;
  const startedAt = Date.now();
  logServerEvent('info', 'maintenance_started', { retentionDays: RETENTION_DAYS });

  try {
    session.cleanupExpiredSessions();
  } catch (error) {
    logServerEvent('error', 'maintenance_failed', { step: 'sessions', error });
  }

  try {
    audit.cleanupOldAuditLogs(RETENTION_DAYS);
  } catch (error) {
    logServerEvent('error', 'maintenance_failed', { step: 'audit_logs', error });
  }

  try {
    activity.cleanupOldActivity(RETENTION_DAYS);
  } catch (error) {
    logServerEvent('error', 'maintenance_failed', { step: 'activity', error });
  }

  logServerEvent('info', 'maintenance_completed', {
    durationMs: Date.now() - startedAt,
    retentionDays: RETENTION_DAYS,
  });
}

function startMaintenanceScheduler(models, intervalMs = SIX_HOURS_MS) {
  stopMaintenanceScheduler();
  runMaintenanceCycle(models);
  scheduler = setInterval(() => runMaintenanceCycle(models), intervalMs);
  if (typeof scheduler.unref === 'function') scheduler.unref();
  return scheduler;
}

function stopMaintenanceScheduler() {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }
}

module.exports = {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  runMaintenanceCycle,
};
