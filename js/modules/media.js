/**
 * 素材管理模块
 * 负责素材的过滤、搜索、渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { sortMedia, sortReview } from '../core/config.js';
import { escapeHtml, formatDatetime } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { showFeedback, setPending } from '../ui/feedback.js';

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

/**
 * 检查是否为管理员用户
 * @returns {boolean}
 */
function isAdminUser() {
  return state.session?.user?.role === 'admin';
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
  const selectedCount = state.selectedMedia.size;
  const hasSelection = selectedCount > 0;

  if (!els.mediaGrid) return;

  const batchActionsHtml = hasSelection
    ? `<div class="batch-actions-bar">
        <span>${selectedCount} 项已选</span>
        <div class="batch-actions">
          <button class="primary-btn" data-batch-action="approve" type="button">✓ 批量通过</button>
          <button class="ghost-btn" data-batch-action="reject" type="button">✗ 批量退回</button>
          <button class="ghost-btn" data-batch-action="clear" type="button">取消选择</button>
        </div>
      </div>`
    : '';

  els.mediaGrid.innerHTML = batchActionsHtml + (items.length
    ? items
      .map(
        (item) => {
          const isSelected = state.selectedMedia.has(item.id);
          const canDelete = isAdminUser();
          const kindIcon = item.kind === 'video' ? '🎬' : '🖼️';
          const statusTone = item.reviewState === 'approved' ? 'success' : item.reviewState === 'rejected' ? 'danger' : 'warning';

          // 截断简介，超过100字显示省略号
          const notePreview = (item.note || '').length > 100
            ? (item.note || '').substring(0, 100) + '...'
            : (item.note || '暂无简介');

          return `
            <article class="media-card media-card--enhanced ${isSelected ? 'is-selected' : ''}" data-media-id="${escapeHtml(item.id)}" data-review-state="${escapeHtml(item.reviewState)}">
              <div class="media-select-overlay">
                <input type="checkbox" class="media-checkbox" data-media-select="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} aria-label="选择 ${escapeHtml(item.title)}" />
              </div>
              <div class="media-thumb-wrapper">
                <img class="media-thumb" alt="${escapeHtml(item.title)}" loading="lazy" src="${escapeHtml(item.thumb || '')}" />
                <div class="media-thumb-overlay">
                  <button class="media-preview-btn" data-media-preview="${escapeHtml(item.id)}" type="button" aria-label="预览素材">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                </div>
                <span class="media-kind-badge" aria-label="${item.kind === 'video' ? '视频' : '图片'}">${kindIcon}</span>
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
                  ${
    item.reviewState === 'pending'
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
  let items = (state.bootstrap?.media || []).filter((item) => reviewMatchesFilter(item));
  return sortReview(items, state.reviewSort);
}

/**
 * 检查素材是否匹配审片过滤条件
 * @param {Object} item - 素材对象
 * @returns {boolean}
 */
function reviewMatchesFilter(item) {
  const filter = state.reviewFilter;
  if (filter === 'all') return item.reviewState === 'pending';
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
  els.reviewStack.innerHTML = items.length
    ? items
      .map(
        (item) => `
            <article class="review-item">
              <img src="${escapeHtml(item.thumb || '')}" alt="${escapeHtml(item.title)}" loading="lazy" />
              <div class="review-copy">
                <div class="review-head">
                  <div>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p class="review-meta">${escapeHtml(item.source)} · ${escapeHtml(item.author)} · ${escapeHtml(item.kind)}</p>
                    ${item.uploadedAt ? `<p class="review-meta"><small>上传于 ${escapeHtml(formatDatetime(item.uploadedAt))}</small></p>` : ''}
                  </div>
                  <span class="status-pill">待审</span>
                </div>
                ${item.note ? `<p class="review-note">${escapeHtml(item.note)}</p>` : ''}
                <label class="field review-note-field">
                  <span>审片备注</span>
                  <textarea class="review-note-input" data-review-note-for="${escapeHtml(item.id)}" rows="2" placeholder="可选：填写通过或退回说明"></textarea>
                </label>
                <div class="tag-row">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
                <div class="review-actions">
                  <button class="primary-btn" data-media-review="approved" data-id="${escapeHtml(item.id)}" type="button">✓ 通过</button>
                  <button class="ghost-btn" data-media-review="rejected" data-id="${escapeHtml(item.id)}" type="button">✗ 退回</button>
                  ${isAdminUser() ? `<button class="ghost-btn" data-media-delete="${escapeHtml(item.id)}" type="button">删除</button>` : ''}
                </div>
              </div>
            </article>
          `,
      )
      .join('')
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
