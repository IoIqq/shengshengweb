/**
 * 素材管理模块
 * 负责素材的过滤、搜索、渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { sortMedia, sortReview } from '../core/config.js';
import { escapeHtml, formatDatetime } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { showFeedback, setPending } from '../ui/feedback.js';

// 上传队列
let uploadQueue = [];

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

const safeText = (value) => escapeHtml(String(value ?? ''));

function addLocalActivity(title, detail) {
  if (!state.bootstrap) state.bootstrap = {};
  if (!Array.isArray(state.bootstrap.activity)) state.bootstrap.activity = [];
  state.bootstrap.activity.unshift({
    id: `local-${Date.now()}`,
    title,
    meta: state.session?.user?.username || '本地操作',
    detail,
    createdAt: new Date().toISOString(),
  });
  document.dispatchEvent(new CustomEvent('activity-updated'));
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

function currentRole() {
  return state.session?.user?.role || state.bootstrap?.user?.role || '';
}

function canReviewMedia() {
  return ['admin', 'editor'].includes(currentRole());
}

function isAdminUser() {
  return currentRole() === 'admin';
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
  const selectedCount = canReviewMedia() ? state.selectedMedia.size : 0;
  const hasSelection = selectedCount > 0;

  if (!els.mediaGrid) return;

  const batchActionsHtml = hasSelection
    ? `<div class="batch-actions-bar" role="status" aria-live="polite">
        <span>${safeText(selectedCount)} 项已选</span>
        <div class="batch-actions">
          <button class="primary-btn" data-batch-action="approve" type="button" aria-label="批量通过 ${safeText(selectedCount)} 个素材"><svg class="media-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>批量通过</button>
          <button class="ghost-btn" data-batch-action="reject" type="button" aria-label="批量退回 ${safeText(selectedCount)} 个素材"><svg class="media-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>批量退回</button>
          <button class="ghost-btn" data-batch-action="clear" type="button">取消选择</button>
        </div>
      </div>`
    : '';

  els.mediaGrid.innerHTML = batchActionsHtml + (items.length
    ? items
      .map(
        (item) => {
          const canReview = canReviewMedia();
          const isSelected = canReview && state.selectedMedia.has(item.id);
          const canDelete = isAdminUser();
          const kindLabel = item.kind === 'video' ? '视频' : '图片';
          const statusTone = item.reviewState === 'approved' ? 'success' : item.reviewState === 'rejected' ? 'danger' : 'warning';

          // 截断简介，超过100字显示省略号
          const notePreview = (item.note || '').length > 100
            ? (item.note || '').substring(0, 100) + '...'
            : (item.note || '暂无简介');

          return `
            <article class="media-card media-card--enhanced ${isSelected ? 'is-selected' : ''}" data-media-id="${escapeHtml(item.id)}" data-review-state="${escapeHtml(item.reviewState)}">
              ${canReview ? `<div class="media-select-overlay">
                <input type="checkbox" class="media-checkbox" data-media-select="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} aria-label="选择 ${escapeHtml(item.title)}" />
              </div>` : ''}
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
                </div>
                <p class="media-meta">
                  <span>${escapeHtml(item.author)}</span>
                  ${item.uploadedAt ? `<span>上传于 ${escapeHtml(formatDatetime(item.uploadedAt).split(' ')[0])}</span>` : ''}
                </p>
                <p class="media-note" title="${escapeHtml(item.note || '')}">${escapeHtml(notePreview)}</p>
                <div class="tag-row">${(item.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</div>
                <div class="media-actions">
                  ${canReview
    ? item.reviewState === 'pending'
      ? `<button class="primary-btn media-action-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button" title="通过审核">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                             <polyline points="20 6 9 17 4 12"/>
                           </svg>
                           通过
                         </button>
                         <button class="ghost-btn media-action-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button" title="退回修改">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                             <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                           </svg>
                           退回
                         </button>`
      : item.reviewState === 'approved'
        ? `<button class="ghost-btn media-action-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button">撤回</button>`
        : `<button class="ghost-btn media-action-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button">重新通过</button>`
    : ''
    }
                  ${canDelete ? `<button class="ghost-btn media-action-btn media-action-btn--danger" data-media-delete="${escapeHtml(item.id)}" type="button" title="删除素材">删除</button>` : ''}
                </div>
              </div>
            </article>
          `;
        }
      )
      .join('')
    : '<div class="empty-state"><strong>没有找到符合条件的素材</strong><p>可以尝试清空筛选条件，或者 <button class="link-btn" type="button" data-jump="media">上传新素材</button>。</p></div>');
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
      : '<div class="empty-state"><strong>当前没有待审素材</strong><p>所有素材都已处理完成。<button class="link-btn" type="button" data-jump="media">去素材库上传</button> 或等待服务器同步。</p></div>';
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
  if (!confirm('确定要删除这个素材吗？此操作不可恢复。')) {
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
  if (!confirm(`确定要批量${action} ${ids.length} 个素材吗？`)) {
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
  const fileInput = document.getElementById('upload-file-input');
  if (!overlay) return;
  clearUploadQueue();
  renderUploadQueue();
  resetUploadProgress();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
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

async function doUpload() {
  if (uploadQueue.length === 0) return;
  const progress = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  const confirmBtn = document.getElementById('upload-confirm-btn');
  const cancelBtn = document.getElementById('upload-cancel-btn');

  if (progress) progress.hidden = false;
  if (confirmBtn) confirmBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  const formData = new FormData();
  uploadQueue.forEach(item => formData.append('files', item.file));

  try {
    const csrfToken = readCookie('ss_csrf');
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');

    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `上传中... ${pct}%`;
      }
    });

    const result = await new Promise((resolve, reject) => {
      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || data.message || `上传失败 (${xhr.status})`));
        } catch (e) {
          reject(new Error('解析服务器响应失败'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
      xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
      xhr.send(formData);
    });

    const uploadedItems = Array.isArray(result.items) ? result.items : Array.isArray(result.media) ? result.media : [];
    if (uploadedItems.length > 0) {
      if (!state.bootstrap) state.bootstrap = {};
      if (!state.bootstrap.media) state.bootstrap.media = [];
      state.bootstrap.media = [...uploadedItems, ...state.bootstrap.media];
      addLocalActivity('素材上传', `上传了 ${uploadedItems.length} 个素材`);
    }

    const uploadedCount = uploadQueue.length;
    Toast.success(canReviewMedia() ? `成功上传 ${uploadedCount} 个素材` : `成功上传 ${uploadedCount} 个素材，等待审核`);
    closeUploadDialog();
    renderMedia();
  } catch (error) {
    Toast.error(error.message || '上传失败');
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (progress) progress.hidden = true;
  }
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

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden && overlay.classList.contains('is-open')) {
      closeUploadDialog();
    }
  });
}
