/**
 * 素材管理模块
 * 负责素材的过滤、搜索、渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { sortMedia, sortReview } from '../core/config.js';
import { escapeHtml, formatDatetime, safeText, currentRole, isAdminUser, addLocalActivity } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { showFeedback, setPending } from '../ui/feedback.js';

// 上传队列
let uploadQueue = [];

// 上传目标缓存（设备列表 / 已有文件夹）
let uploadTargetCache = { devices: [], folders: [] };

async function loadUploadTargetOptions() {
  const [devRes, folderRes] = await Promise.all([
    requestJSON('/api/devices'),
    requestJSON('/api/media/folders'),
  ]);
  uploadTargetCache.devices = Array.isArray(devRes) ? devRes : (devRes?.items || devRes?.devices || []);
  uploadTargetCache.folders = folderRes?.folders || [];

  const deviceSel = document.getElementById('upload-device-select');
  if (deviceSel) {
    deviceSel.innerHTML = '<option value="">（不指定设备）</option>' +
      uploadTargetCache.devices
        .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
        .join('');
  }
  const folderSel = document.getElementById('upload-existing-folder');
  if (folderSel) {
    const opts = [];
    for (const y of uploadTargetCache.folders) {
      for (const ev of (y.events || [])) {
        const rel = `media/${y.year}/${ev}`;
        opts.push(`<option value="${escapeHtml(rel)}">${y.year} / ${escapeHtml(ev)}</option>`);
      }
    }
    folderSel.innerHTML = opts.length ? opts.join('') : '<option value="">（暂无已有文件夹）</option>';
  }
}

function readUploadTarget() {
  const modeEl = document.querySelector('input[name="upload-target-mode"]:checked');
  const mode = modeEl?.value === 'existing' ? 'existing' : 'new';
  const deviceId = document.getElementById('upload-device-select')?.value || '';
  const deviceName = uploadTargetCache.devices.find((d) => d.id === deviceId)?.name || '';
  if (mode === 'existing') {
    return { mode, existingPath: document.getElementById('upload-existing-folder')?.value || '', deviceId, deviceName };
  }
  const date = document.getElementById('upload-event-date')?.value || '';
  const eventName = document.getElementById('upload-event-name')?.value || '';
  return { mode, date, eventName, deviceId, deviceName };
}

function createUploadQueueItem(file) {
  const isImage = file.type.startsWith('image/');
  return {
    file,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : '',
  };
}

function revokeUploadQueueItem(item) {
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

function clearUploadQueue() {
  uploadQueue.forEach(revokeUploadQueueItem);
  uploadQueue = [];
}

/**
 * 检查素材是否匹配当前过滤条件
 * @param {Object} item - 素材对象
 * @returns {boolean}
 */
export function mediaMatchesFilter(item) {
  const filter = state.mediaFilter;
  if (filter === 'all') return true;
  if (filter === 'pending') return item.reviewState === 'pending';
  if (filter === 'approved') return item.reviewState === 'approved';
  return item.kind === filter;
}

/**
 * 检查素材是否匹配搜索关键词
 * @param {Object} item - 素材对象
 * @param {string} search - 搜索关键词
 * @returns {boolean}
 */
export function matchesSearch(item, search) {
  if (!search) return true;
  const source = [item.title, item.source, item.author, ...(item.tags || []), item.note]
    .join(' ')
    .toLowerCase();
  return source.includes(search.toLowerCase());
}

function canReviewMedia() {
  return ['admin', 'editor'].includes(currentRole());
}

/**
 * 渲染素材库
 */
export function renderMedia() {
  let items = (state.bootstrap?.media || [])
    .filter((item) => mediaMatchesFilter(item) && matchesSearch(item, state.mediaSearch))
    .map((item) => ({
      ...item,
      statusLabel: item.reviewState === 'approved' ? '已通过' : item.reviewState === 'rejected' ? '退回' : '待审',
    }));

  items = sortMedia(items, state.mediaSort);

  if (!els.mediaGrid) return;

  const render = state.mediaViewMode === 'grid' ? renderMediaCardGrid : renderMediaRowList;
  els.mediaGrid.innerHTML = items.length
    ? render(items)
    : '<div class="empty-state"><strong>没有找到符合条件的素材</strong><p>可以尝试清空筛选条件，或者 <button class="link-btn" type="button" data-shortcut="upload">上传新素材</button>。</p></div>';
}

/** 大图标网格卡片 */
function renderMediaCardGrid(items) {
  const canDelete = isAdminUser();
  return items
    .map((item) => {
      const kindLabel = item.kind === 'video' ? '视频' : '图片';
      const statusTone = item.reviewState === 'approved' ? 'success' : item.reviewState === 'rejected' ? 'danger' : 'warning';
      const notePreview = (item.note || '').length > 100
        ? (item.note || '').substring(0, 100) + '...'
        : (item.note || '暂无简介');

      return `
        <article class="media-card media-card--enhanced" data-media-id="${escapeHtml(item.id)}" data-review-state="${escapeHtml(item.reviewState)}">
          <div class="media-thumb-wrapper">
            <img class="media-thumb" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" src="${escapeHtml(item.thumb || '')}" />
            <div class="media-thumb-overlay">
              <button class="media-preview-btn" data-media-preview="${escapeHtml(item.id)}" type="button" aria-label="预览素材">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <span class="media-kind-badge" aria-label="${kindLabel}">${kindLabel}</span>
          </div>
          <div class="media-body">
            <div class="media-topline">
              <h3 class="media-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
              <span class="status-pill status-pill--${statusTone}" data-status="${escapeHtml(item.reviewState)}">${escapeHtml(item.statusLabel)}</span>
              ${item.transferState && item.transferState !== 'ready' ? `<span class="transfer-badge transfer-badge--${escapeHtml(item.transferState)}">${item.transferState === 'failed' ? '传输失败' : '传输中'}</span>` : ''}
            </div>
            <p class="media-meta">
              <span>${escapeHtml(item.author)}</span>
              ${item.uploadedAt ? `<span>上传于 ${escapeHtml(formatDatetime(item.uploadedAt).split(' ')[0])}</span>` : ''}
            </p>
            <p class="media-note" title="${escapeHtml(item.note || '')}">${escapeHtml(notePreview)}</p>
            <div class="tag-row">${(item.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</div>
            <div class="media-actions">
              ${canDelete ? `<button class="ghost-btn media-action-btn media-action-btn--danger" data-media-delete="${escapeHtml(item.id)}" type="button" title="删除素材">删除</button>` : ''}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

/** 列表流：单列竖向，左缩略图 + 右信息 + 操作 */
function renderMediaRowList(items) {
  const canDelete = isAdminUser();
  return items
    .map((item) => {
      const kindLabel = item.kind === 'video' ? '视频' : '图片';
      const statusTone = item.reviewState === 'approved' ? 'success' : item.reviewState === 'rejected' ? 'danger' : 'warning';
      const dateLabel = item.uploadedAt ? formatDatetime(item.uploadedAt).split(' ')[0] : '';
      return `
        <article class="media-row" data-media-id="${escapeHtml(item.id)}" data-review-state="${escapeHtml(item.reviewState)}">
          <button class="media-row-thumb" data-media-preview="${escapeHtml(item.id)}" type="button" aria-label="预览 ${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.thumb || '')}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
            <span class="media-kind-badge" aria-label="${kindLabel}">${kindLabel}</span>
          </button>
          <div class="media-row-main">
            <div class="media-row-topline">
              <strong class="media-row-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
              <span class="status-pill status-pill--${statusTone}" data-status="${escapeHtml(item.reviewState)}">${escapeHtml(item.statusLabel)}</span>
              ${item.transferState && item.transferState !== 'ready' ? `<span class="transfer-badge transfer-badge--${escapeHtml(item.transferState)}">${item.transferState === 'failed' ? '传输失败' : '传输中'}</span>` : ''}
            </div>
            <div class="media-row-meta">
              <span>${escapeHtml(item.author || '—')}</span>
              ${dateLabel ? `<span class="media-row-date">${escapeHtml(dateLabel)}</span>` : ''}
              <span class="media-row-tags">${(item.tags || []).slice(0, 4).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</span>
            </div>
          </div>
          <div class="media-row-actions">
            <button class="ghost-btn media-preview-btn media-row-preview" data-media-preview="${escapeHtml(item.id)}" type="button" aria-label="预览 ${escapeHtml(item.title)}" title="预览">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${canDelete ? `<button class="ghost-btn media-action-btn--danger media-row-delete" data-media-delete="${escapeHtml(item.id)}" type="button" aria-label="删除 ${escapeHtml(item.title)}" title="删除"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

/**
 * 获取审片中心的素材列表
 * @returns {Array}
 */
export function reviewItems() {
  let items = (state.bootstrap?.media || [])
    .filter((item) => reviewMatchesFilter(item) && matchesSearch(item, state.reviewSearch));
  return sortReview(items, state.reviewSort);
}

/**
 * 检查素材是否匹配审片过滤条件
 * @param {Object} item - 素材对象
 * @returns {boolean}
 */
function reviewMatchesFilter(item) {
  const filter = state.reviewFilter;
  if (item.reviewState !== 'pending') return false;
  if (filter === 'all') return true;
  return item.kind === filter;
}

/**
 * 渲染审片中心
 */
export function renderReview() {
  const items = reviewItems();
  const stats = getReviewStats();
  if (els.reviewCount) {
    els.reviewCount.textContent = `${items.length} 条待处理 (图片: ${stats.image}, 视频: ${stats.video})`;
  }
  if (!els.reviewStack) return;
  const hasPendingItems = (state.bootstrap?.media || []).some((item) => item.reviewState === 'pending');
  els.reviewStack.innerHTML = items.length
    ? items
      .map(
        (item) => {
          const kindLabel = item.kind === 'video' ? '视频' : '图片';
          const noteText = item.note || '暂无素材说明';
          return `
            <article class="review-item media-card--enhanced" data-review-id="${escapeHtml(item.id)}" data-review-kind="${escapeHtml(item.kind || '')}">
              <div class="review-thumb-wrap media-thumb-wrapper">
                <img class="media-thumb" src="${escapeHtml(item.thumb || '')}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
                <div class="media-thumb-overlay media-thumb-overlay--visible">
                  <button class="media-preview-btn" data-media-preview="${escapeHtml(item.id)}" type="button" aria-label="预览 ${escapeHtml(item.title || '待审素材')}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
                <span class="media-kind-badge">${escapeHtml(kindLabel)}</span>
              </div>
              <div class="review-copy">
                <div class="review-head">
                  <div>
                    <h3>${escapeHtml(item.title || '未命名素材')}</h3>
                    <p class="review-meta">${escapeHtml(item.source || '-')} · ${escapeHtml(item.author || '-')} · ${escapeHtml(kindLabel)}</p>
                    ${item.uploadedAt ? `<p class="review-meta"><small>上传于 ${escapeHtml(formatDatetime(item.uploadedAt))}</small></p>` : ''}
                  </div>
                  <span class="status-pill status-pill--warning" data-status="pending">待审</span>
                </div>
                <p class="review-note">${escapeHtml(noteText)}</p>
                <div class="tag-row">${(item.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</div>
                <label class="field review-note-field">
                  <span>审片备注</span>
                  <textarea class="review-note-input" data-review-note-for="${escapeHtml(item.id)}" rows="2" placeholder="可选：填写通过或退回说明" aria-label="${escapeHtml(item.title || '素材')} 的审片备注"></textarea>
                </label>
                <div class="review-actions">
                  <button class="primary-btn media-action-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button" aria-label="通过 ${escapeHtml(item.title || '该素材')}"><svg class="media-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>通过</button>
                  <button class="ghost-btn media-action-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button" aria-label="退回 ${escapeHtml(item.title || '该素材')}"><svg class="media-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>退回</button>
                  ${isAdminUser() ? `<button class="ghost-btn media-action-btn media-action-btn--danger" data-media-delete="${escapeHtml(item.id)}" type="button" aria-label="删除 ${escapeHtml(item.title || '该素材')}">删除</button>` : ''}
                </div>
              </div>
            </article>
          `;
        },
      )
      .join('')
    : hasPendingItems
      ? '<div class="empty-state"><strong>没有符合筛选条件的待审素材</strong><p>可以调整搜索关键词、类型筛选或排序方式。</p></div>'
      : '<div class="empty-state"><strong>当前没有待审素材</strong><p>所有素材都已处理完成。<button class="link-btn" type="button" data-shortcut="upload">去素材库上传</button> 或等待服务器同步。</p></div>';
}

/**
 * 获取审片统计信息
 * @returns {Object}
 */
export function getReviewStats() {
  const items = (state.bootstrap?.media || []).filter((item) => item.reviewState === 'pending');
  return {
    total: items.length,
    image: items.filter((item) => item.kind === 'photo').length,
    video: items.filter((item) => item.kind === 'video').length,
  };
}

/**
 * 审核素材（通过或退回）
 * @param {string} id - 素材 ID
 * @param {string} status - 审核状态 (approved, rejected)
 * @param {string} note - 审核备注
 */
export async function reviewMedia(id, status, note = '') {
  try {
    setPending(true);
    const result = await requestJSON(`/api/media/${id}/review`, {
      method: 'POST',
      body: { status, note },
    });

    // 更新本地状态
    const media = state.bootstrap?.media || [];
    const item = media.find((m) => m.id === id);
    if (item) {
      item.reviewState = status;
      if (note) item.reviewNote = note;
    }

    Toast.success(status === 'approved' ? '已通过审核' : '已退回修改');
    addLocalActivity('素材审核', status === 'approved' ? '通过了一条素材' : '退回了一条素材');
    renderMedia();
    renderReview();
    return result;
  } catch (error) {
    Toast.error(error.message || '审核失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 删除素材
 * @param {string} id - 素材 ID
 */
export async function deleteMedia(id) {
  const confirmed = await Dialog.confirm({
    title: '删除素材',
    message: '确定要删除这个素材吗？此操作不可恢复。',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) {
    return;
  }

  try {
    setPending(true);
    await requestJSON(`/api/media/${id}`, { method: 'DELETE' });

    // 从本地状态中移除
    if (state.bootstrap?.media) {
      state.bootstrap.media = state.bootstrap.media.filter((m) => m.id !== id);
    }

    // 从选中列表中移除
    state.selectedMedia.delete(id);

    Toast.success('素材已删除');
    addLocalActivity('素材删除', '删除了一条素材');
    renderMedia();
    renderReview();
  } catch (error) {
    Toast.error(error.message || '删除失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 批量审核素材
 * @param {string} status - 审核状态 (approved, rejected)
 */
export async function batchReviewMedia(status) {
  const ids = Array.from(state.selectedMedia);
  if (ids.length === 0) {
    Toast.warning('请先选择要操作的素材');
    return;
  }

  const action = status === 'approved' ? '通过' : '退回';
  const confirmed = await Dialog.confirm({
    title: `批量${action}`,
    message: `确定要批量${action} ${ids.length} 个素材吗？`,
    confirmText: action,
    cancelText: '取消',
    variant: status === 'approved' ? 'info' : 'warning',
  });
  if (!confirmed) {
    return;
  }

  try {
    setPending(true);
    showFeedback(`正在批量${action}...`, 'info', 'media');

    const results = await Promise.allSettled(
      ids.map((id) => reviewMedia(id, status))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed === 0) {
      Toast.success(`已批量${action} ${succeeded} 个素材`);
    } else {
      Toast.warning(`${succeeded} 个成功，${failed} 个失败`);
    }

    // 清空选择
    state.selectedMedia.clear();
    renderMedia();
  } catch (error) {
    Toast.error(error.message || '批量操作失败');
  } finally {
    setPending(false);
  }
}

/**
 * 切换素材选中状态
 * @param {string} id - 素材 ID
 */
export function toggleMediaSelection(id) {
  if (state.selectedMedia.has(id)) {
    state.selectedMedia.delete(id);
  } else {
    state.selectedMedia.add(id);
  }
  renderMedia();
}

/**
 * 清空素材选择
 */
export function clearMediaSelection() {
  state.selectedMedia.clear();
  renderMedia();
}

/**
 * 选择所有可见素材
 */
export function selectAllVisibleMedia() {
  const items = (state.bootstrap?.media || [])
    .filter((item) => mediaMatchesFilter(item) && matchesSearch(item, state.mediaSearch));
  items.forEach((item) => state.selectedMedia.add(item.id));
  renderMedia();
}

/* ======== 上传功能 ======== */

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export function openUploadDialog() {
  const overlay = document.getElementById('upload-overlay');
  if (!overlay) return;
  clearUploadQueue();
  renderUploadQueue();
  resetUploadProgress();
  // 默认今天
  const dateInput = document.getElementById('upload-event-date');
  if (dateInput && !dateInput.value) {
    const d = new Date();
    dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  updateFolderPreview();
  loadUploadTargetOptions().catch((error) => { Toast.error(error.message || '加载目标选项失败'); });
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function updateFolderPreview() {
  const preview = document.getElementById('upload-folder-preview');
  if (!preview) return;
  const t = readUploadTarget();
  if (t.mode === 'existing') {
    preview.textContent = t.existingPath ? `目标：${t.existingPath}/<设备>` : '请选择已有文件夹';
  } else {
    const digits = (t.date || '').replace(/\D+/g, '').slice(0, 8);
    const year = digits.slice(0, 4);
    const ev = (t.eventName || '').replace(/[\\/:*?"<>|]/g, '').trim();
    preview.textContent = digits
      ? `将创建：media/${year}/${digits}${ev}/<设备>`
      : '请填写日期和活动名';
  }
}

export function closeUploadDialog() {
  const overlay = document.getElementById('upload-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  setTimeout(() => {
    overlay.hidden = true;
    clearUploadQueue();
    renderUploadQueue();
    resetUploadProgress();
  }, 200);
}

function resetUploadProgress() {
  const progress = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  const confirmBtn = document.getElementById('upload-confirm-btn');
  if (progress) progress.hidden = true;
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = '上传中...';
  if (confirmBtn) confirmBtn.disabled = uploadQueue.length === 0;
}

function addFilesToQueue(files) {
  for (const file of files) {
    if (uploadQueue.find(item => item.file.name === file.name && item.file.size === file.size)) continue;
    uploadQueue.push(createUploadQueueItem(file));
  }
  renderUploadQueue();
  const confirmBtn = document.getElementById('upload-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = uploadQueue.length === 0;
}

function removeFileFromQueue(index) {
  const [removed] = uploadQueue.splice(index, 1);
  revokeUploadQueueItem(removed);
  renderUploadQueue();
  const confirmBtn = document.getElementById('upload-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = uploadQueue.length === 0;
}

function renderUploadQueue() {
  const container = document.getElementById('upload-queue');
  if (!container) return;
  if (uploadQueue.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = uploadQueue.map((item, i) => {
    const file = item.file;
    const preview = item.isImage
      ? `<img src="${escapeHtml(item.previewUrl)}" alt="" class="upload-preview-thumb" />`
      : '<span class="upload-preview-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 7 1 1 7 1 23 23 23 23 7"/><circle cx="8" cy="7" r="1"/></svg></span>';
    return `<div class="upload-queue-item">
      ${preview}
      <div class="upload-queue-info">
        <strong>${escapeHtml(file.name)}</strong>
        <small>${formatFileSize(file.size)}</small>
      </div>
      <button class="upload-queue-remove" data-upload-remove="${i}" type="button" aria-label="移除 ${escapeHtml(file.name)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }).join('');
}

function buildBatchFormData(batch, target) {
  const fd = new FormData();
  for (const item of batch) fd.append('files', item.file);
  fd.append('mode', target.mode);
  if (target.mode === 'existing') {
    fd.append('existingPath', target.existingPath);
  } else {
    fd.append('date', target.date);
    fd.append('eventName', target.eventName);
  }
  fd.append('deviceId', target.deviceId);
  fd.append('deviceName', target.deviceName);
  return fd;
}

async function uploadOneBatch(batch, target) {
  const csrfToken = readCookie('ss_csrf');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/media/upload');
  if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
  return new Promise((resolve, reject) => {
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `上传失败 (${xhr.status})`));
      } catch {
        reject(new Error('解析服务器响应失败'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
    xhr.send(buildBatchFormData(batch, target));
  });
}

async function doUpload() {
  if (uploadQueue.length === 0) return;
  const target = readUploadTarget();
  if (target.mode === 'new' && (!target.date || !target.eventName)) {
    Toast.error('请填写日期和活动名');
    return;
  }
  if (target.mode === 'existing' && !target.existingPath) {
    Toast.error('请选择已有文件夹');
    return;
  }

  const progress = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  const confirmBtn = document.getElementById('upload-confirm-btn');
  const cancelBtn = document.getElementById('upload-cancel-btn');
  if (progress) progress.hidden = false;
  if (confirmBtn) confirmBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  const batchSize = Math.max(1, Number(window.shengshengConfig?.UPLOAD_BATCH_SIZE) || 20);
  const concurrency = Math.max(1, Number(window.shengshengConfig?.TRANSFER_CONCURRENCY) || 4);
  const batches = [];
  for (let i = 0; i < uploadQueue.length; i += batchSize) {
    batches.push(uploadQueue.slice(i, i + batchSize));
  }

  let done = 0;
  const total = uploadQueue.length;
  const uploadedItems = [];
  const failed = [];
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const myIdx = idx++;
      const batch = batches[myIdx];
      try {
        const result = await uploadOneBatch(batch, target);
        const items = Array.isArray(result.items) ? result.items : [];
        uploadedItems.push(...items);
        done += batch.length;
        if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
        if (text) text.textContent = `上传中... ${done}/${total}`;
      } catch {
        failed.push(...batch);
        done += batch.length;
        if (text) text.textContent = `上传中... ${done}/${total}（部分失败）`;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

    if (uploadedItems.length > 0) {
      if (!state.bootstrap) state.bootstrap = {};
      if (!state.bootstrap.media) state.bootstrap.media = [];
      state.bootstrap.media = [...uploadedItems, ...state.bootstrap.media];
      addLocalActivity('素材上传', `上传了 ${uploadedItems.length} 个素材`);
    }

    if (failed.length === 0) {
      Toast.success(canReviewMedia() ? `成功上传 ${uploadedItems.length} 个素材` : `成功上传 ${uploadedItems.length} 个素材，等待审核`);
      closeUploadDialog();
    } else {
      Toast.warning(`${uploadedItems.length} 成功，${failed.length} 失败`);
    }
    renderMedia();
    renderReview();
    // 后台传输可能仍在进行，轮询传输态更新徽标
    pollTransferStates(uploadedItems.map((i) => i.id));
  } catch (error) {
    Toast.error(error.message || '上传失败');
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (progress) progress.hidden = true;
  }
}

function pollTransferStates(ids) {
  if (!ids.length) return;
  let attempts = 0;
  const maxAttempts = 60; // 最长 ~2 分钟
  const tick = async () => {
    attempts++;
    try {
      const res = await requestJSON(`/api/media/transfer-states?ids=${encodeURIComponent(ids.join(','))}`);
      const states = res.states || {};
      const pending = ids.filter((id) => ['staging', 'transferring'].includes(states[id]));
      renderMedia(); // 刷新徽标
      if (pending.length && attempts < maxAttempts) {
        setTimeout(tick, 2000);
      }
    } catch {
      /* 静默 */
    }
  };
  setTimeout(tick, 2000);
}

// 初始化上传对话框事件
export function initUploadDialog() {
  const overlay = document.getElementById('upload-overlay');
  if (!overlay) return;

  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');
  const closeBtn = document.getElementById('upload-dialog-close');
  const cancelBtn = document.getElementById('upload-cancel-btn');
  const confirmBtn = document.getElementById('upload-confirm-btn');
  const queueContainer = document.getElementById('upload-queue');

  // 目标切换与预览
  const targetRadios = overlay.querySelectorAll('input[name="upload-target-mode"]');
  targetRadios.forEach((r) => r.addEventListener('change', () => {
    const newBox = document.getElementById('upload-target-new');
    const existBox = document.getElementById('upload-target-existing');
    const isExisting = document.querySelector('input[name="upload-target-mode"]:checked')?.value === 'existing';
    if (newBox) newBox.hidden = isExisting;
    if (existBox) existBox.hidden = !isExisting;
    updateFolderPreview();
  }));
  document.getElementById('upload-event-date')?.addEventListener('input', updateFolderPreview);
  document.getElementById('upload-event-name')?.addEventListener('input', updateFolderPreview);
  document.getElementById('upload-existing-folder')?.addEventListener('change', updateFolderPreview);
  document.getElementById('upload-device-select')?.addEventListener('change', updateFolderPreview);

  // 点击拖拽区域打开文件选择器
  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput?.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.length) addFilesToQueue(e.dataTransfer.files);
    });
  }

  // 文件选择
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) addFilesToQueue(fileInput.files);
      fileInput.value = '';
    });
  }

  // 关闭按钮
  closeBtn?.addEventListener('click', closeUploadDialog);
  cancelBtn?.addEventListener('click', closeUploadDialog);

  // 确认上传
  confirmBtn?.addEventListener('click', doUpload);

  // 移除队列项
  queueContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-upload-remove]');
    if (btn) {
      const idx = parseInt(btn.dataset.uploadRemove, 10);
      removeFileFromQueue(idx);
    }
  });

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeUploadDialog();
  });

  // ESC 关闭（用具名函数避免面板重挂时重复注册）
  if (!overlay._uploadEscHandler) {
    overlay._uploadEscHandler = (e) => {
      if (e.key === 'Escape' && !overlay.hidden && overlay.classList.contains('is-open')) {
        closeUploadDialog();
      }
    };
    document.addEventListener('keydown', overlay._uploadEscHandler);
  }
}

/* ======== 视图切换（列表 / 大图标） ======== */

const MEDIA_VIEW_KEY = 'shengsheng.media.viewMode';

export function initMediaViewSwitcher() {
  // 从 localStorage 读取记忆的视图，默认 list
  const saved = localStorage.getItem(MEDIA_VIEW_KEY) === 'grid' ? 'grid' : 'list';
  state.mediaViewMode = saved;
  applyMediaViewMode();

  const listBtn = document.getElementById('view-list-btn');
  const gridBtn = document.getElementById('view-grid-btn');
  listBtn?.addEventListener('click', () => setMediaViewMode('list'));
  gridBtn?.addEventListener('click', () => setMediaViewMode('grid'));
}

function setMediaViewMode(mode) {
  if (mode !== 'list' && mode !== 'grid') return;
  if (state.mediaViewMode === mode) return;
  state.mediaViewMode = mode;
  localStorage.setItem(MEDIA_VIEW_KEY, mode);
  applyMediaViewMode();
  renderMedia();
}

function applyMediaViewMode() {
  const mode = state.mediaViewMode === 'grid' ? 'grid' : 'list';
  const listBtn = document.getElementById('view-list-btn');
  const gridBtn = document.getElementById('view-grid-btn');
  if (listBtn) {
    const active = mode === 'list';
    listBtn.classList.toggle('is-active', active);
    listBtn.setAttribute('aria-pressed', String(active));
  }
  if (gridBtn) {
    const active = mode === 'grid';
    gridBtn.classList.toggle('is-active', active);
    gridBtn.setAttribute('aria-pressed', String(active));
  }
  const grid = document.getElementById('media-grid');
  if (grid) {
    grid.classList.toggle('media-list', mode === 'list');
    grid.classList.toggle('media-grid', mode === 'grid');
  }
}

/* ======== 查重（弹窗） ======== */

const DEDUP_VIEW_KEY = 'shengsheng.dedup.expanded';

function readExpandedGroups() {
  try {
    const v = JSON.parse(localStorage.getItem(DEDUP_VIEW_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function toggleExpandedGroup(index) {
  const set = new Set(readExpandedGroups());
  if (set.has(index)) set.delete(index);
  else set.add(index);
  localStorage.setItem(DEDUP_VIEW_KEY, JSON.stringify([...set]));
}

export function openDedupDialog() {
  const overlay = document.getElementById('dedup-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  renderDedupGroups();
}

export function closeDedupDialog() {
  const overlay = document.getElementById('dedup-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  setTimeout(() => { overlay.hidden = true; }, 200);
}

export async function runDedupScan() {
  const btn = document.getElementById('dedup-scan-btn');
  const progress = document.getElementById('dedup-progress');
  if (btn) btn.disabled = true;
  if (progress) { progress.hidden = false; progress.textContent = '正在计算哈希…'; }
  try {
    setPending(true);
    const res = await requestJSON('/api/media/dedup/scan', { method: 'POST' });
    if (progress) progress.textContent = `已计算 ${res.hashed} 个，剩余 ${res.remaining} 个未哈希；发现 ${res.groups} 组重复。`;
    await renderDedupGroups();
  } catch (error) {
    Toast.error(error.message || '查重失败');
  } finally {
    setPending(false);
    if (btn) btn.disabled = false;
  }
}

export async function renderDedupGroups() {
  const container = document.getElementById('dedup-groups');
  const progress = document.getElementById('dedup-progress');
  if (!container) return;
  try {
    const res = await requestJSON('/api/media/dedup/groups');
    if (progress) {
      progress.hidden = false;
      progress.textContent = res.unhashed > 0
        ? `仍有 ${res.unhashed} 个素材未计算哈希（后台空闲时自动补算，或点“开始查重”）。`
        : '全部素材已计算哈希。';
    }
    const groups = res.groups || [];
    const expanded = new Set(readExpandedGroups());
    container.innerHTML = groups.length
      ? groups.map((g, gi) => {
        const isOpen = expanded.has(gi);
        return `
        <div class="dedup-group${isOpen ? ' is-open' : ''}" data-dedup-group="${gi}">
          <button class="dedup-group-head" type="button" data-dedup-toggle="${gi}" aria-expanded="${isOpen}">
            <svg class="dedup-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            <strong>${escapeHtml(String(g.count))} 个重复</strong>
            <small>哈希 ${escapeHtml(String(g.hash).slice(0, 12))}…</small>
          </button>
          <div class="dedup-group-body"${isOpen ? '' : ' hidden'}>
            <div class="dedup-cards">
              ${g.items.map((it) => {
    const kindLabel = it.kind === 'video' ? '视频' : '图片';
    const folder = (it.source || '').replace(/^.*\s\/\s/, '');
    return `
                <div class="dedup-card" data-dedup-card="${escapeHtml(it.id)}">
                  <div class="dedup-card-thumb">
                    <img src="${escapeHtml(it.thumb || '')}" alt="${escapeHtml(it.title || '素材')}" loading="lazy" decoding="async" />
                    <span class="media-kind-badge">${escapeHtml(kindLabel)}</span>
                  </div>
                  <div class="dedup-card-info">
                    <strong class="dedup-item-title" title="${escapeHtml(it.title || '未命名')}">${escapeHtml(it.title || '未命名')}</strong>
                    <small class="dedup-card-folder" title="${escapeHtml(it.source || '')}">${escapeHtml(folder || '未知来源')}</small>
                    <small class="dedup-card-date">${it.uploadedAt ? escapeHtml(formatDatetime(it.uploadedAt).split(' ')[0]) : ''}</small>
                  </div>
                  <div class="dedup-card-actions">
                    <button class="ghost-btn dedup-keep-btn" data-dedup-keep="${escapeHtml(it.id)}" type="button" aria-label="保留此个" title="保留此个">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="ghost-btn dedup-del-btn" data-dedup-delete="${escapeHtml(it.id)}" type="button" aria-label="删除此重复素材" title="删除">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>`;
  }).join('')}
            </div>
          </div>
        </div>`;
      }).join('')
      : '<div class="empty-state"><strong>没有发现重复素材</strong><p>上传更多素材后可再次查重。</p></div>';
  } catch (error) {
    container.innerHTML = `<div class="empty-state">查重结果加载失败：${escapeHtml(error.message || '')}</div>`;
  }
}

export function initDedup() {
  const overlay = document.getElementById('dedup-overlay');
  if (!overlay) return;
  document.getElementById('dedup-btn')?.addEventListener('click', openDedupDialog);
  document.getElementById('dedup-dialog-close')?.addEventListener('click', closeDedupDialog);
  document.getElementById('dedup-scan-btn')?.addEventListener('click', runDedupScan);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDedupDialog(); });
  if (!overlay._dedupEscHandler) {
    overlay._dedupEscHandler = (e) => {
      if (e.key === 'Escape' && !overlay.hidden && overlay.classList.contains('is-open')) closeDedupDialog();
    };
    document.addEventListener('keydown', overlay._dedupEscHandler);
  }

  const groupsEl = document.getElementById('dedup-groups');
  groupsEl?.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-dedup-toggle]');
    const keepBtn = e.target.closest('[data-dedup-keep]');
    const delBtn = e.target.closest('[data-dedup-delete]');
    if (toggleBtn) {
      const idx = Number(toggleBtn.dataset.dedupToggle);
      toggleExpandedGroup(idx);
      await renderDedupGroups();
      return;
    }
    if (delBtn) {
      const confirmed = await Dialog.confirm({
        title: '删除重复素材',
        message: '确定删除该重复素材？文件也会被清理。',
        confirmText: '删除',
        cancelText: '取消',
        variant: 'danger',
      });
      if (!confirmed) return;
      try {
        setPending(true);
        await requestJSON(`/api/media/${delBtn.dataset.dedupDelete}`, { method: 'DELETE' });
        if (state.bootstrap?.media) {
          state.bootstrap.media = state.bootstrap.media.filter((m) => m.id !== delBtn.dataset.dedupDelete);
        }
        Toast.success('已删除');
        await renderDedupGroups();
        renderMedia();
      } catch (error) {
        Toast.error(error.message || '删除失败');
      } finally {
        setPending(false);
      }
    }
    if (keepBtn) {
      const card = keepBtn.closest('[data-dedup-card]');
      if (card) card.classList.add('is-kept');
      Toast.info('已标记保留此个，请删除组内其它项');
    }
  });
}
