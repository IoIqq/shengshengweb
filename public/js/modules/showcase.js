import { request } from '../utils/api.js';
import { escapeHtml } from '../utils/helpers.js';

export async function loadShowcase() {
  const grid = document.getElementById('showcase-grid');
  const empty = document.getElementById('showcase-empty');

  try {
    const data = await request('/api/media/showcase');
    const items = data?.items || [];
    if (!items.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    renderShowcaseGallery(items, grid);
    bindLightbox();
  } catch (error) {
    grid.innerHTML = '<div class="showcase-loading">加载失败，请稍后重试</div>';
  }
}

function renderShowcaseGallery(items, grid) {
  grid.innerHTML = items
    .map((item, index) => {
      const isVideo = item.kind === 'video';
      const thumbSrc = item.thumb || '';
      const title = escapeHtml(item.title || '未命名');
      const author = escapeHtml(item.author || '');

      if (isVideo) {
        return `
          <article class="showcase-card" data-index="${index}" data-kind="video">
            <div class="showcase-card-media" data-src="${escapeHtml(item.url || '')}">
              <img src="${thumbSrc}" alt="${title}" loading="lazy" />
              <span class="showcase-play-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
              </span>
            </div>
            <div class="showcase-card-body">
              <strong>${title}</strong>
              <small>${author} · 视频</small>
            </div>
          </article>`;
      }

      return `
        <article class="showcase-card" data-index="${index}" data-kind="photo">
          <div class="showcase-card-media" data-src="${escapeHtml(item.url || '')}">
            <img src="${thumbSrc}" alt="${title}" loading="lazy" />
          </div>
          <div class="showcase-card-body">
            <strong>${title}</strong>
            <small>${author} · 图片</small>
          </div>
        </article>`;
    })
    .join('');
}

function bindLightbox() {
  const lightbox = document.getElementById('showcase-lightbox');
  const lightboxImg = document.getElementById('showcase-lightbox-img');
  const lightboxTitle = document.getElementById('showcase-lightbox-title');
  const lightboxClose = document.getElementById('showcase-lightbox-close');

  if (!lightbox || lightbox.dataset.bound) return;
  lightbox.dataset.bound = '1';

  const cards = document.querySelectorAll('.showcase-card[data-kind="photo"] .showcase-card-media');
  cards.forEach((mediaEl) => {
    mediaEl.addEventListener('click', () => {
      const src = mediaEl.dataset.src;
      const card = mediaEl.closest('.showcase-card');
      const title = card?.querySelector('strong')?.textContent || '';
      lightboxImg.src = src;
      lightboxImg.alt = title;
      lightboxTitle.textContent = title;
      lightbox.classList.remove('hidden');
      lightboxImg.focus();
    });
  });

  lightboxClose.addEventListener('click', () => {
    lightbox.classList.add('hidden');
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
      lightbox.classList.add('hidden');
    }
  });
}
