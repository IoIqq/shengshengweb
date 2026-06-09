let activePreview = null;

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'video[controls]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function isFocusableElement(value) {
  return Boolean(value?.focus);
}

function isVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url || '');
}

function previewUrl(media) {
  return media?.url || media?.thumb || '';
}

function mediaTitle(media) {
  return media?.title || '素材预览';
}

function trapTab(event, dialog) {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showStageLoading(stage, text = '正在加载预览...') {
  stage.innerHTML = `<div class="media-preview-fallback media-preview-loading">${text}</div>`;
}

function showStageError(stage) {
  stage.innerHTML = '<div class="media-preview-fallback">文件不可访问或已移动</div>';
}

function renderStage(stage, media, url) {
  stage.textContent = '';
  const shouldRenderVideo = Boolean(media?.url) && (media.kind === 'video' || isVideoUrl(media.url));

  if (shouldRenderVideo) {
    showStageLoading(stage, '正在读取视频信息...');
    const video = document.createElement('video');
    video.className = 'media-preview-video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = media.url;
    if (media.thumb) video.poster = media.thumb;
    video.addEventListener('loadedmetadata', () => {
      stage.textContent = '';
      stage.appendChild(video);
    }, { once: true });
    video.addEventListener('error', () => showStageError(stage), { once: true });
    return;
  }

  if (url) {
    showStageLoading(stage, '正在加载图片...');
    const img = document.createElement('img');
    img.className = 'media-preview-image';
    img.alt = mediaTitle(media);
    img.decoding = 'async';
    img.addEventListener('load', async () => {
      try {
        if (typeof img.decode === 'function') await img.decode();
      } catch (error) {
        // 解码失败时仍交给浏览器显示已加载图片。
      }
      stage.textContent = '';
      stage.appendChild(img);
    }, { once: true });
    img.addEventListener('error', () => showStageError(stage), { once: true });
    img.src = url;
    return;
  }

  const fallback = document.createElement('div');
  fallback.className = 'media-preview-fallback';
  fallback.textContent = '该素材暂无可预览内容';
  stage.appendChild(fallback);
}

export function closeMediaPreview({ restoreFocus = true } = {}) {
  activePreview?.close(restoreFocus);
}

export function openMediaPreview(media) {
  const url = previewUrl(media);
  closeMediaPreview({ restoreFocus: false });

  const previousFocus = isFocusableElement(document.activeElement) ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  const overlay = document.createElement('div');
  overlay.className = 'media-preview-overlay';
  overlay.innerHTML = `
    <section class="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
      <header class="media-preview-head">
        <div>
          <p class="media-preview-kicker">内容预览</p>
          <h3 id="media-preview-title" class="media-preview-title"></h3>
        </div>
        <button class="media-preview-close" type="button" aria-label="关闭预览">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>
      <div class="media-preview-stage"></div>
      <footer class="media-preview-footer">
        <p class="media-preview-meta"></p>
        <a class="ghost-btn media-preview-open" target="_blank" rel="noopener noreferrer">打开原链接</a>
      </footer>
    </section>
  `;

  const dialog = overlay.querySelector('.media-preview-dialog');
  const title = overlay.querySelector('.media-preview-title');
  const stage = overlay.querySelector('.media-preview-stage');
  const closeBtn = overlay.querySelector('.media-preview-close');
  const openLink = overlay.querySelector('.media-preview-open');
  const meta = overlay.querySelector('.media-preview-meta');

  title.textContent = mediaTitle(media);
  meta.textContent = [media?.source, media?.author, media?.kind === 'video' ? '视频' : '图片'].filter(Boolean).join(' · ');
  if (url) {
    openLink.href = url;
    openLink.setAttribute('aria-label', `在新标签打开 ${mediaTitle(media)}`);
  } else {
    openLink.hidden = true;
  }
  renderStage(stage, media, url);

  let closing = false;
  const close = (restoreFocus = true) => {
    if (closing) return;
    closing = true;
    const video = overlay.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = previousOverflow;
    const remove = () => {
      overlay.remove();
      if (activePreview?.overlay === overlay) activePreview = null;
      if (restoreFocus) previousFocus?.focus?.();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) remove();
    else window.setTimeout(remove, 180);
  };

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    trapTab(event, dialog);
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close(true);
  });
  closeBtn.addEventListener('click', () => close(true));
  document.addEventListener('keydown', handleKeydown);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  activePreview = { overlay, close };
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    closeBtn.focus();
  });
}
