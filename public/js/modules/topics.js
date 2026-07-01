import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, debounce } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending } from '../ui/feedback.js';

function isEditor() {
  return state.session?.user?.role === 'admin' || state.session?.user?.role === 'editor';
}

const STATUS = { idea: '灵感', researching: '调研中', selected: '已入选', archived: '已归档' };

function buildEmbedUrl(url, platform) {
  try {
    const u = new URL(url);
    if (platform === 'bilibili') {
      const m = u.pathname.match(/\/(BV\w+)/) || u.pathname.match(/\/video\/(\w+)/);
      return m ? `//player.bilibili.com/player.html?bvid=${m[1]}` : '';
    }
    if (platform === 'youtube') {
      const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      return id ? `//www.youtube-nocookie.com/embed/${id}` : '';
    }
    if (platform === 'vimeo') {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return /^\d+$/.test(id) ? `//player.vimeo.com/video/${id}` : '';
    }
    return '';
  } catch (_) { return ''; }
}

function matchesTopicSearch(item, search) {
  if (!search) return true;
  const s = search.toLowerCase();
  return [item.title, item.description, item.sourceHost, item.sourcePlatform, ...(item.tags || [])].join(' ').toLowerCase().includes(s);
}

function matchesTopicFilter(item) {
  return state.topicFilter === 'all' || item.status === state.topicFilter;
}

export async function loadTopics() {
  try {
    const result = await requestJSON('/api/topic-library');
    state.topicItems = Array.isArray(result?.items) ? result.items : [];
    renderTopics();
  } catch (error) {
    Toast.error(error.message || '选题库加载失败');
  }
}

export function renderTopics() {
  const items = (state.topicItems || [])
    .filter((item) => matchesTopicFilter(item) && matchesTopicSearch(item, state.topicSearch));
  if (els.topicsBadge) els.topicsBadge.textContent = `${items.length} 条选题`;
  if (!els.topicsList) return;
  els.topicsList.innerHTML = items.length
    ? items.map((item) => {
        const label = STATUS[item.status] || item.status;
        const embed = item.embedUrl || buildEmbedUrl(item.sourceUrl, item.sourcePlatform);
        const previewId = `topic-preview-${item.id}`;
        return `<article class="media-card media-card--enhanced topic-card" data-topic-id="${escapeHtml(item.id)}" data-platform="${escapeHtml(item.sourcePlatform || 'other')}">
          <div class="topic-thumb-wrap media-thumb-wrapper">
            ${embed
              ? `<div class="topic-preview-box" id="${previewId}" data-embed="${escapeHtml(embed)}">
                   <iframe title="${escapeHtml(item.title)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="topic-iframe" aria-label="${escapeHtml(item.title)} 的嵌入预览"></iframe>
                 </div>`
              : `<div class="topic-no-preview"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><strong>暂不支持嵌入预览</strong><span>可通过下方按钮打开原链接查看素材</span></div>`
            }
            <span class="media-kind-badge">${escapeHtml(item.sourcePlatform || '链接')}</span>
          </div>
          <div class="media-body">
            <div class="media-topline">
              <h3 class="media-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
              <span class="status-pill topic-status-pill" data-topic-status="${escapeHtml(item.status)}">${escapeHtml(label)}</span>
            </div>
            <p class="media-meta">
              <span>${escapeHtml(item.sourceHost || '-')}</span>
              ${item.createdAt ? `<span>创建于 ${escapeHtml(String(item.createdAt).slice(0, 10))}</span>` : ''}
            </p>
            ${item.description ? `<p class="media-note">${escapeHtml(item.description)}</p>` : ''}
            ${(item.tags || []).length ? `<div class="tag-row">${item.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            <div class="media-actions">
              <a class="ghost-btn media-action-btn" href="${/^https?:/i.test(item.sourceUrl || '') ? escapeHtml(item.sourceUrl) : '#'}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escapeHtml(item.title)} 原链接">打开原链接</a>
              ${isEditor() ? `<button class="ghost-btn media-action-btn" data-topic-edit="${escapeHtml(item.id)}" type="button" aria-label="编辑 ${escapeHtml(item.title)}">编辑</button><button class="ghost-btn media-action-btn media-action-btn--danger" data-topic-delete="${escapeHtml(item.id)}" type="button" aria-label="删除 ${escapeHtml(item.title)}">删除</button>` : ''}
            </div>
          </div>
        </article>`;
      }).join('')
    : '<div class="empty-state"><strong>选题库暂无内容</strong><p>为新媒体视频创作构建选题，添加第一个灵感链接试试。</p></div>';
  items.forEach((item) => renderTopicPreview(item.id));
}

export function renderTopicPreview(id) {
  const el = document.getElementById(`topic-preview-${id}`);
  if (!el) return;
  const embed = el.dataset.embed;
  if (!embed) return;
  const src = embed.startsWith('http') ? embed : `https:${embed}`;
  el.querySelector('iframe')?.setAttribute('src', src);
}

export async function addTopic(formData) {
  const title = (formData.get('title') || '').trim();
  const sourceUrl = (formData.get('sourceUrl') || '').trim();
  if (!title) { Toast.warning('请输入选题标题'); return false; }
  if (!sourceUrl) { Toast.warning('请输入流媒体链接'); return false; }
  try {
    setPending(true);
    const tags = (formData.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const description = (formData.get('description') || '').trim();
    const result = await requestJSON('/api/topic-library', { method: 'POST', body: { title, sourceUrl, description, tags } });
    if (result?.ok) {
      const topic = result.item;
      topic.sourcePlatform = topic.sourcePlatform || 'other';
      state.topicItems.unshift(topic);
      Toast.success('选题已添加');
      renderTopics();
      return true;
    }
    return false;
  } catch (error) {
    Toast.error(error.message || '添加选题失败');
    return false;
  } finally {
    setPending(false);
  }
}

export async function updateTopic(id, formData) {
  try {
    setPending(true);
    const body = {};
    if (formData.get('title')) body.title = formData.get('title').trim();
    if (formData.get('sourceUrl')) body.sourceUrl = formData.get('sourceUrl').trim();
    if (formData.get('description')) body.description = formData.get('description').trim();
    if (formData.get('tags')) body.tags = formData.get('tags').split(',').map((s) => s.trim()).filter(Boolean);
    if (formData.get('status')) body.status = formData.get('status');
    const result = await requestJSON(`/api/topic-library/${id}`, { method: 'PATCH', body });
    if (result?.ok) {
      const idx = (state.topicItems || []).findIndex((t) => t.id === id);
      if (idx !== -1) state.topicItems[idx] = result.item;
      Toast.success('选题已更新');
      renderTopics();
      return result;
    }
    return null;
  } catch (error) {
    Toast.error(error.message || '更新选题失败');
    return null;
  } finally {
    setPending(false);
  }
}

export async function deleteTopic(id) {
  const confirmed = await Dialog.confirm({ title: '删除选题', message: '确定要删除这个选题吗？此操作不可恢复。', confirmText: '删除', cancelText: '取消', variant: 'danger' });
  if (!confirmed) return;
  try {
    setPending(true);
    await requestJSON(`/api/topic-library/${id}`, { method: 'DELETE' });
    state.topicItems = (state.topicItems || []).filter((t) => t.id !== id);
    Toast.success('选题已删除');
    renderTopics();
  } catch (error) {
    Toast.error(error.message || '删除选题失败');
  } finally {
    setPending(false);
  }
}

export function bindTopicsEvents() {
  if (els.topicsForm) {
    els.topicsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.topicsForm);
      const editingId = state.topicEditingId;
      const success = editingId ? await updateTopic(editingId, formData) : await addTopic(formData);
      if (success) {
        els.topicsForm.reset();
        state.topicEditingId = null;
        if (els.topicsSubmitBtn) els.topicsSubmitBtn.textContent = '添加选题';
      }
    });
  }

  if (els.topicsSearch) {
    els.topicsSearch.addEventListener('input', debounce(() => { state.topicSearch = els.topicsSearch.value; renderTopics(); }, 300));
  }

  if (els.topicsFilters) {
    els.topicsFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-topic-filter]');
      if (!btn) return;
      els.topicsFilters.querySelectorAll('[data-topic-filter]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.topicFilter = btn.dataset.topicFilter;
      els.topicsFilters.querySelectorAll('[data-topic-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      renderTopics();
    });
  }

  if (els.topicsList) {
    els.topicsList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-topic-delete]');
      if (deleteBtn) { deleteTopic(deleteBtn.dataset.topicDelete); return; }
      const editBtn = e.target.closest('[data-topic-edit]');
      if (editBtn) {
        const id = editBtn.dataset.topicEdit;
        const item = (state.topicItems || []).find((t) => t.id === id);
        if (!item) return;
        if (els.topicsForm) {
          els.topicsForm.querySelector('[name="title"]').value = item.title || '';
          els.topicsForm.querySelector('[name="sourceUrl"]').value = item.sourceUrl || '';
          els.topicsForm.querySelector('[name="description"]').value = item.description || '';
          els.topicsForm.querySelector('[name="tags"]').value = (item.tags || []).join(', ');
        }
        state.topicEditingId = id;
        if (els.topicsSubmitBtn) els.topicsSubmitBtn.textContent = '保存修改';
        els.topicsForm?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}
