const { run, saveDatabase } = require('./database');

/**
 * 清理过期的 activity 记录
 */
function cleanupOldActivity(retentionDays = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  run('DELETE FROM activity WHERE created_at < ?', [cutoffDate]);
  saveDatabase();
}

module.exports = {
  cleanupOldActivity,
};
