/**
 * 维护操作模块
 * 危险操作集中入口：备份快照、清理过期会话、重启服务、清空全部数据。
 * 二次确认走 preferences.confirmIfNeeded（按用户偏好弹/不弹），
 * 「清空数据」额外强制要求文字输入"删除"——独立于偏好开关。
 */

import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { setPending } from '../ui/feedback.js';
import { escapeHtml } from '../utils/helpers.js';
import { confirmIfNeeded } from './preferences.js';

let bound = false;

export function initMaintenancePanel() {
  loadSnapshots();
  if (bound) return;
  bound = true;

  document.getElementById('snapshot-backup-btn')?.addEventListener('click', onSnapshot);
  document.getElementById('snapshot-refresh-btn')?.addEventListener('click', loadSnapshots);
  document.getElementById('cleanup-sessions-btn')?.addEventListener('click', onCleanupSessions);
  document.getElementById('restart-server-btn')?.addEventListener('click', onRestart);
  document.getElementById('wipe-database-btn')?.addEventListener('click', onWipe);
}

async function loadSnapshots() {
  const list = document.getElementById('snapshot-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">读取中...</p>';
  try {
    const { items } = await requestJSON('/api/backup/snapshots');
    if (!items?.length) {
      list.innerHTML = '<p class="empty-state">暂无服务器端快照。</p>';
      return;
    }
    list.innerHTML = items.map((snap) => `
      <div class="maintenance-snap">
        <div>
          <strong>${escapeHtml(snap.name)}</strong>
          <small>${formatBytes(snap.size)} · ${formatTime(snap.createdAt)}</small>
        </div>
        <div class="maintenance-snap-actions">
          <a class="ghost-btn" href="/api/backup/snapshots/${encodeURIComponent(snap.name)}/download" download="${escapeHtml(snap.name)}">下载</a>
          <button class="ghost-btn danger" type="button" data-snap-delete="${escapeHtml(snap.name)}">删除</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-snap-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteSnapshot(btn.dataset.snapDelete));
    });
  } catch (error) {
    list.innerHTML = `<p class="empty-state">读取失败：${escapeHtml(error.message || '')}</p>`;
  }
}

async function onSnapshot() {
  if (!confirmIfNeeded('在服务器端生成一份完整数据快照？文件将写入 server/backups/。')) return;
  try {
    setPending(true);
    Toast.info('正在生成快照...');
    const result = await requestJSON('/api/backup/snapshot', { method: 'POST' });
    Toast.success(`已生成快照：${result.name}`);
    loadSnapshots();
  } catch (error) {
    Toast.error(error.message || '生成快照失败');
  } finally {
    setPending(false);
  }
}

async function onCleanupSessions() {
  if (!confirmIfNeeded('清理所有已过期的登录会话？当前在线用户不受影响。')) return;
  try {
    setPending(true);
    const result = await requestJSON('/api/system/sessions/cleanup', { method: 'POST' });
    const banner = document.getElementById('cleanup-sessions-result');
    if (banner) banner.textContent = `上次清理：删除 ${result.deleted} 条`;
    Toast.success(`已清理 ${result.deleted} 条过期会话`);
  } catch (error) {
    Toast.error(error.message || '清理失败');
  } finally {
    setPending(false);
  }
}

async function onRestart() {
  if (!confirmIfNeeded('立即重启服务？所有用户会被短暂断连，约 5 秒后恢复。')) return;
  try {
    setPending(true);
    const result = await requestJSON('/api/system/restart', { method: 'POST' });
    Toast.warning(result.message || '服务即将重启');
  } catch (error) {
    Toast.error(error.message || '触发重启失败');
  } finally {
    setPending(false);
  }
}

async function onWipe() {
  // 强制 prompt 输入「删除」，无论二次确认开关是否打开
  const typed = window.prompt(
    '⚠️ 即将清空全部业务数据（素材 / 待办 / 设备 / 借出 / 团队 / 留言 / 选题 / 活动 / 审计 / 注册申请）。\n' +
    '管理员账号与当前登录会话会保留。\n\n' +
    '此操作不可撤销。如确认，请输入"删除"：',
  );
  if (typed !== '删除') {
    Toast.info('已取消');
    return;
  }
  if (!window.confirm('最后确认：是否真的清空所有业务数据？')) {
    Toast.info('已取消');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/system/wipe', {
      method: 'POST',
      body: { confirm: '删除' },
    });
    const tableCount = result.summary?.tables?.length || 0;
    Toast.success(`已清空 ${tableCount} 张业务表`);
    // 数据全没后立刻刷新数据快照，避免页面残留旧渲染
    setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    Toast.error(error.message || '清空失败');
  } finally {
    setPending(false);
  }
}

async function deleteSnapshot(name) {
  if (!confirmIfNeeded(`确定删除快照「${name}」？此操作不可撤销。`)) return;
  try {
    await requestJSON(`/api/backup/snapshots/${encodeURIComponent(name)}`, { method: 'DELETE' });
    Toast.success('快照已删除');
    loadSnapshots();
  } catch (e) {
    Toast.error(e.message || '删除失败');
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}
