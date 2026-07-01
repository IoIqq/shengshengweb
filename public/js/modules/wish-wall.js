import { state } from '../core/state.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { escapeHtml } from '../utils/helpers.js';

let initialized = false;
let modal = null;
let lastFocused = null;

// 连点彩蛋
let clickCount = 0;
let clickResetTimer = null;
const STREAK_TARGET = 5;
const STREAK_RESET_MS = 800;

export function initWishWall() {
  if (initialized) return;

  const easterDot = document.getElementById('wish-easter-dot');
  modal = document.getElementById('wish-modal');
  const closeBtn = document.getElementById('wish-modal-close');
  const overlay = document.getElementById('wish-modal-overlay');
  const form = document.getElementById('wish-form');
  const charCount = document.getElementById('wish-char-count');
  const textarea = form?.querySelector('textarea[name="content"]');

  if (!easterDot || !modal) return;

  initialized = true;

  bindClickStreak(easterDot);
  closeBtn?.addEventListener('click', closeWishModal);
  overlay?.addEventListener('click', closeWishModal);
  form?.addEventListener('submit', handleSubmit);
  textarea?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(textarea.value.length);
  });

  modal.addEventListener('click', handleWishActions);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.hidden) closeWishModal();
  });
  window.addEventListener('shengsheng:session', () => {
    if (!modal?.hidden) loadWishes();
  });
}

/**
 * 连点彩蛋：快速点击圆点 5 次触发留言墙（类似 Android 开发者模式）
 * 支持鼠标、触摸、键盘 Enter/Space
 */
function bindClickStreak(dot) {
  const onActivate = () => {
    clickCount += 1;
    if (clickResetTimer) window.clearTimeout(clickResetTimer);

    dot.classList.remove('is-tapped');
    // 触发 reflow 以重新播放动画
    void dot.offsetWidth;
    dot.classList.add('is-tapped');

    if (clickCount >= STREAK_TARGET) {
      clickCount = 0;
      window.clearTimeout(clickResetTimer);
      dot.classList.remove('is-tapped', 'is-charging');
      dot.classList.add('is-burst');
      window.setTimeout(() => dot.classList.remove('is-burst'), 360);
      openWishModal();
      return;
    }

    if (clickCount >= 3) dot.classList.add('is-charging');

    clickResetTimer = window.setTimeout(() => {
      clickCount = 0;
      dot.classList.remove('is-tapped', 'is-charging');
    }, STREAK_RESET_MS);
  };

  dot.addEventListener('click', onActivate);
  dot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  });
}


function openWishModal() {
  if (!modal) return;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  loadWishes();
  requestAnimationFrame(() => document.getElementById('wish-modal-close')?.focus());
}

function closeWishModal() {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  lastFocused?.focus?.();
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const data = {
    content: formData.get('content'),
    mood: formData.get('mood') || '',
    anonymous: formData.get('anonymous') === 'on',
  };

  try {
    await requestJSON('/api/wishes', {
      method: 'POST',
      body: data,
    });

    form.reset();
    const charCount = document.getElementById('wish-char-count');
    if (charCount) charCount.textContent = '0';
    showToast('留言发布成功！', 'success');
    loadWishes();
  } catch (error) {
    showToast(error.message || '发布失败', 'error');
  }
}

async function loadWishes() {
  const wishList = document.getElementById('wish-list');
  if (!wishList) return;

  try {
    const wishes = await requestJSON('/api/wishes');
    const items = Array.isArray(wishes) ? wishes : [];

    if (!items.length) {
      wishList.innerHTML = '<div class="wish-empty">还没有留言，快来发布第一条吧！</div>';
      return;
    }

    wishList.innerHTML = items.map((wish) => renderWishItem(wish)).join('');
  } catch (error) {
    wishList.innerHTML = '<div class="wish-empty">加载失败，请刷新重试</div>';
  }
}

function renderWishItem(wish) {
  const id = escapeHtml(wish.id);
  const mood = wish.mood ? `<span class="wish-item-mood">${escapeHtml(wish.mood)}</span>` : '';
  const deleteButton = isWishAdmin()
    ? `<button class="wish-item-delete" type="button" data-wish-delete="${id}" aria-label="删除这条留言">删除</button>`
    : '';

  return `
    <div class="wish-item" data-id="${id}">
      <div class="wish-item-header">
        <div class="wish-item-author">
          <span>${escapeHtml(wish.author || '匿名用户')}</span>
          ${mood}
        </div>
      </div>
      <div class="wish-item-content">${escapeHtml(wish.content)}</div>
      <div class="wish-item-footer">
        <span class="wish-item-time">${formatTime(wish.createdAt || wish.created_at)}</span>
        ${deleteButton}
      </div>
    </div>
  `;
}

async function handleWishActions(event) {
  const deleteButton = event.target.closest('[data-wish-delete]');
  if (!deleteButton) return;

  const id = deleteButton.dataset.wishDelete;
  if (!id) return;
  const confirmed = await Dialog.confirm({
    title: '删除留言',
    message: '确定要删除这条留言吗？',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await requestJSON(`/api/wishes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('删除成功', 'success');
    loadWishes();
  } catch (error) {
    showToast(error.message || '删除失败', 'error');
  }
}

function isWishAdmin() {
  return state.session?.user?.role === 'admin';
}

function formatTime(timestamp) {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '未知时间';
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function showToast(message, type = 'info') {
  if (typeof Toast[type] === 'function') {
    Toast[type](message);
  } else {
    Toast.info(message);
  }
}
