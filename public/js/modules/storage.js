import { state } from '../core/state.js';
import { escapeHtml } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function sourceLabel(source) {
  if (source === 'env') return '.env 环境变量';
  if (source === 'storage-config') return '界面配置';
  return '默认路径';
}

function statusText(health) {
  if (!health?.exists) return '未创建';
  if (!health?.isDirectory && health?.path) return '不是目录';
  if (!health?.readable) return '不可读';
  if (!health?.writable) return '不可写';
  return '正常';
}

function renderPathRow(label, health) {
  const ok = health?.ok || (health?.exists && health?.isDirectory && health?.readable && health?.writable);
  return `
    <div class="storage-path-row" data-ok="${ok ? 'true' : 'false'}">
      <span>${escapeHtml(label)}</span>
      <code>${escapeHtml(health?.path || '-')}</code>
      <strong>${escapeHtml(statusText(health))}</strong>
    </div>
  `;
}

function renderVolume(volume) {
  const usedPercent = Number(volume.usedPercent || 0);
  const recommendedPath = `${String(volume.root || '').replace(/\\/g, '/').replace(/\/+$/, '')}/ShengshengStorage/uploads`;
  return `
    <article class="storage-volume-card" data-current="${volume.isCurrentStorage ? 'true' : 'false'}">
      <div class="storage-volume-head">
        <div>
          <h4>${escapeHtml(volume.root || '-')}</h4>
          <p>${volume.isCurrentStorage ? '当前素材盘' : '可选存储盘'}</p>
        </div>
        <span class="storage-source-badge">${volume.capacityAvailable ? `${usedPercent}% 已用` : '容量未知'}</span>
      </div>
      <div class="storage-usage-bar" aria-label="硬盘使用率 ${escapeHtml(String(usedPercent))}%">
        <span style="width:${Math.min(100, Math.max(0, usedPercent))}%"></span>
      </div>
      <div class="storage-volume-meta">
        <span>总容量：${volume.capacityAvailable ? formatBytes(volume.totalBytes) : '-'}</span>
        <span>剩余：${volume.capacityAvailable ? formatBytes(volume.freeBytes) : '-'}</span>
      </div>
      <button class="ghost-btn storage-use-volume" type="button" data-storage-root="${escapeHtml(recommendedPath)}">用作素材盘</button>
    </article>
  `;
}

function renderLanAddress(item) {
  return `
    <div class="storage-lan-row">
      <span>${escapeHtml(item.name || '网卡')}</span>
      <code>${escapeHtml(item.url || '')}</code>
      <button class="copy-btn storage-copy-lan" type="button" data-copy-text="${escapeHtml(item.url || '')}" aria-label="复制局域网地址">复制</button>
    </div>
  `;
}

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  Toast.success('已复制到剪贴板');
}

function renderStorageNotice(config, health) {
  const notices = [];
  if (config.restartRequired) {
    notices.push('已保存新的素材目录配置，重启服务后才会生效。');
  }
  if (config.envOverrides?.uploadDir || config.envOverrides?.inboxDir) {
    notices.push('.env 环境变量正在覆盖界面配置，如需界面配置生效，请修改或移除对应变量。');
  }
  for (const item of config.storageDirStatus || []) {
    if (!item.ok) notices.push(`${item.label}不可用：${item.path}`);
  }
  if (health?.uploadDir && !health.uploadDir.ok) {
    notices.push('当前素材根目录不可用，请重新选择素材存放空间。');
  }
  if (!notices.length) return '';
  return `
    <div class="storage-notice" role="status">
      ${notices.map((notice) => `<p>${escapeHtml(notice)}</p>`).join('')}
    </div>
  `;
}

export async function loadStorageStatus() {
  const container = document.getElementById('storage-status-card');
  if (container && !state.storageStatus) {
    container.innerHTML = '<div class="storage-empty">正在读取服务器存储状态...</div>';
  }
  try {
    const status = await requestJSON('/api/storage/status');
    state.storageStatus = status;
    renderStorageStatus();
    return status;
  } catch (error) {
    if (container) container.innerHTML = `<div class="empty-state">${escapeHtml(error.message || '读取存储状态失败')}</div>`;
    Toast.error(error.message || '读取存储状态失败');
    return null;
  }
}

export function renderStorageStatus() {
  const status = state.storageStatus;
  if (!status) return;

  const statusCard = document.getElementById('storage-status-card');
  if (statusCard) {
    const config = status.config || {};
    const health = status.health || {};
    const usage = status.usage || {};
    statusCard.innerHTML = `
      <div class="storage-card-head">
        <div>
          <h3>当前素材存储</h3>
          <p>配置来源：<strong>${escapeHtml(sourceLabel(config.source))}</strong></p>
        </div>
        <span class="storage-source-badge">${escapeHtml(sourceLabel(config.source))}</span>
      </div>
      ${renderStorageNotice(config, health)}
      <div class="storage-path-list">
        ${renderPathRow('素材根目录', health.uploadDir)}
        ${renderPathRow('媒体目录', health.mediaDir)}
        ${renderPathRow('Inbox 目录', health.inboxDir)}
        ${renderPathRow('头像目录', health.avatarDir)}
        ${renderPathRow('设备图片目录', health.deviceImageDir)}
      </div>
      ${config.savedConfig?.uploadDir ? `
        <div class="storage-pending-config">
          <span>已保存配置</span>
          <code>${escapeHtml(config.savedConfig.uploadDir)}</code>
          <strong>${config.restartRequired ? '待重启生效' : '已生效'}</strong>
        </div>
      ` : ''}
      <div class="storage-summary-line">
        <span>已统计文件：${escapeHtml(String(usage.files || 0))}${usage.truncated ? '（已截断）' : ''}</span>
        <span>占用空间：${formatBytes(usage.sizeBytes)}</span>
      </div>
    `;
  }

  const form = document.getElementById('storage-form');
  if (form && !form.dataset.initialized) {
    form.uploadDir.value = status.config?.savedConfig?.uploadDir || status.config?.uploadDir || '';
    form.inboxDir.value = status.config?.savedConfig?.inboxDir || status.config?.inboxDir || '';
    form.dataset.initialized = 'true';
  }

  const volumeList = document.getElementById('storage-volume-list');
  if (volumeList) {
    const volumes = Array.isArray(status.volumes) ? status.volumes : [];
    volumeList.innerHTML = volumes.length
      ? volumes.map(renderVolume).join('')
      : '<div class="empty-state">暂未识别到可显示的硬盘。</div>';
  }

  const lanList = document.getElementById('storage-lan-list');
  if (lanList) {
    const addresses = Array.isArray(status.lan) ? status.lan : [];
    lanList.innerHTML = addresses.length
      ? addresses.map(renderLanAddress).join('')
      : '<div class="empty-state">暂未识别到局域网地址。</div>';
  }
}

function renderValidation(result) {
  const panel = document.getElementById('storage-validation-result');
  if (!panel) return;
  state.storageValidation = result;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="storage-validation-card" data-ok="${result.ok ? 'true' : 'false'}">
      <h4>${result.ok ? '路径验证通过' : '路径验证未通过'}</h4>
      ${Array.isArray(result.errors) && result.errors.length ? `<ul>${result.errors.map(error => `<li>${escapeHtml(error.message)}</li>`).join('')}</ul>` : ''}
      ${result.envSnippet ? `<label class="field"><span>可复制的 .env 配置</span><textarea readonly rows="3">${escapeHtml(result.envSnippet)}</textarea></label>` : ''}
    </div>
  `;
}

export async function validateStorageConfig() {
  const form = document.getElementById('storage-form');
  if (!form) return null;
  const body = {
    uploadDir: form.uploadDir.value.trim(),
    inboxDir: form.inboxDir.value.trim(),
  };
  try {
    const result = await requestJSON('/api/storage/validate', { method: 'POST', body, retry: false });
    renderValidation(result);
    Toast.success('路径验证通过');
    return result;
  } catch (error) {
    renderValidation(error.payload || { ok: false, errors: [{ message: error.message || '路径验证失败' }] });
    Toast.error(error.message || '路径验证失败');
    return null;
  }
}

export async function saveStorageConfig() {
  const form = document.getElementById('storage-form');
  if (!form) return;
  const confirmed = await Dialog.confirm({
    title: '保存素材存储配置',
    message: '保存后需要重启服务才会生效，当前正在运行的素材目录不会立即切换。',
    confirmText: '保存配置',
    cancelText: '取消',
    variant: 'warning',
  });
  if (!confirmed) return;

  const body = {
    uploadDir: form.uploadDir.value.trim(),
    inboxDir: form.inboxDir.value.trim(),
  };
  try {
    const result = await requestJSON('/api/storage/config', { method: 'POST', body, retry: false });
    renderValidation(result.validation || { ok: true });
    Toast.success(result.effectiveAfterRestart ? '存储配置已保存，请重启服务后生效' : result.reason || '存储配置已保存');
    await loadStorageStatus();
  } catch (error) {
    renderValidation(error.payload || { ok: false, errors: [{ message: error.message || '保存失败' }] });
    Toast.error(error.message || '保存失败');
  }
}

export function fillRecommendedStoragePath(root) {
  const form = document.getElementById('storage-form');
  if (!form || !root) return;
  const uploadDir = String(root).replace(/\\/g, '/');
  form.uploadDir.value = uploadDir;
  form.inboxDir.value = `${uploadDir.replace(/\/+$/, '')}/inbox`;
  Toast.info('已填入推荐素材目录，请先验证路径');
}

export function bindStorageEvents() {
  const refreshBtn = document.getElementById('storage-refresh-btn');
  refreshBtn?.addEventListener('click', () => loadStorageStatus());

  const validateBtn = document.getElementById('storage-validate-btn');
  validateBtn?.addEventListener('click', () => validateStorageConfig());

  const saveBtn = document.getElementById('storage-save-btn');
  saveBtn?.addEventListener('click', () => saveStorageConfig());

  const root = document.getElementById('storage-content');
  root?.addEventListener('click', async (event) => {
    const volumeBtn = event.target.closest('.storage-use-volume');
    if (volumeBtn) {
      fillRecommendedStoragePath(volumeBtn.dataset.storageRoot);
      return;
    }

    const copyBtn = event.target.closest('[data-copy-text]');
    if (copyBtn) {
      await copyText(copyBtn.dataset.copyText);
    }
  });
}
