import { request } from '../utils/api.js';
import { escapeHtml } from '../utils/helpers.js';

// 当前数据与浏览状态
let allItems = [];
let currentFilter = 'all';
let lightboxList = []; // 当前可见项（按筛选过滤），lightbox 导航基于它
let lightboxIndex = -1;

export async function loadShowcase() {
  const grid = document.getElementById('showcase-grid');
  const empty = document.getElementById('showcase-empty');
  const countEl = document.getElementById('showcase-count');

  try {
    const data = await request('/api/media/showcase');
    allItems = data?.items || [];
    if (countEl) countEl.textContent = String(allItems.length).padStart(2, '0');
    updateFilterCounts();

    if (!allItems.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    renderShowcaseGallery(allItems, grid);
    bindLightbox();
    bindFilters();
    revealCards(grid);
  } catch (error) {
    grid.innerHTML = '<div class="showcase-loading">载入失败，请稍后重试</div>';
    if (countEl) countEl.textContent = '00';
  }
}

function renderShowcaseGallery(items, grid) {
  grid.innerHTML = items
    .map((item, index) => {
      const isVideo = item.kind === 'video';
      const thumbSrc = escapeHtml(item.thumb || '');
      const title = escapeHtml(item.title || '未命名');
      const author = escapeHtml(item.author || '');
      const kindLabel = isVideo ? 'FILM' : 'PHOTO';

      const playOverlay = isVideo
        ? `<span class="showcase-play-icon" aria-hidden="true">
             <span>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(240,236,225,0.92)" stroke="none"><polygon points="6,4 20,12 6,20"/></svg>
             </span>
           </span>`
        : '';

      return `
        <article class="showcase-card" data-index="${index}" data-kind="${isVideo ? 'video' : 'photo'}" style="--i:${index}">
          <div class="showcase-card-media" data-src="${escapeHtml(item.url || '')}">
            <img src="${thumbSrc}" alt="${title}" loading="lazy" />
            ${playOverlay}
          </div>
          <div class="showcase-card-body">
            <strong>${title}</strong>
            <small>${author ? author + ' · ' : ''}${kindLabel}</small>
          </div>
        </article>`;
    })
    .join('');
}

/* --- 分类筛选 --- */
function updateFilterCounts() {
  const counts = {
    all: allItems.length,
    video: allItems.filter((i) => i.kind === 'video').length,
    photo: allItems.filter((i) => i.kind !== 'video').length,
  };
  document.querySelectorAll('.showcase-filter-btn .num').forEach((el) => {
    const key = el.dataset.count;
    el.textContent = counts[key] ?? 0;
  });
}

function bindFilters() {
  const filters = document.getElementById('showcase-filters');
  if (!filters || filters.dataset.bound) return;
  filters.dataset.bound = '1';

  filters.querySelectorAll('.showcase-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (filter === currentFilter) return;
      currentFilter = filter;

      filters.querySelectorAll('.showcase-filter-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      applyFilter(filter);
    });
  });
}

function applyFilter(filter) {
  const cards = document.querySelectorAll('.showcase-card');
  cards.forEach((card) => {
    const match = filter === 'all' || card.dataset.kind === filter;
    card.classList.toggle('is-hidden', !match);
  });
}

/* 滚动渐显：IntersectionObserver，禁用 scroll 监听；reduce-motion 下直接显示 */
function revealCards(grid) {
  const cards = grid.querySelectorAll('.showcase-card');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  cards.forEach((c) => io.observe(c));
}

/* --- Lightbox（图片 + 视频 + 前后导航）--- */
function bindLightbox() {
  const lightbox = document.getElementById('showcase-lightbox');
  const lightboxImg = document.getElementById('showcase-lightbox-img');
  const lightboxVideo = document.getElementById('showcase-lightbox-video');
  const lightboxTitle = document.getElementById('showcase-lightbox-title');
  const lightboxClose = document.getElementById('showcase-lightbox-close');
  const prevBtn = document.getElementById('showcase-lightbox-prev');
  const nextBtn = document.getElementById('showcase-lightbox-next');

  if (!lightbox || lightbox.dataset.bound) return;
  lightbox.dataset.bound = '1';

  function resetMedia() {
    if (lightboxVideo) {
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
      lightboxVideo.classList.add('hidden');
    }
    if (lightboxImg) lightboxImg.classList.add('hidden');
  }

  function showAt(index) {
    if (index < 0 || index >= lightboxList.length) return;
    lightboxIndex = index;
    const item = lightboxList[index];
    const isVideo = item.kind === 'video';
    const title = item.title || '未命名';

    resetMedia();
    if (isVideo && lightboxVideo) {
      lightboxVideo.classList.remove('hidden');
      lightboxVideo.src = item.url || '';
      lightboxVideo.play().catch(() => {});
    } else {
      lightboxImg.classList.remove('hidden');
      lightboxImg.src = item.url || '';
      lightboxImg.alt = title;
    }
    lightboxTitle.textContent = title;

    // 单件时隐藏前后箭头
    const multiple = lightboxList.length > 1;
    if (prevBtn) prevBtn.style.display = multiple ? '' : 'none';
    if (nextBtn) nextBtn.style.display = multiple ? '' : 'none';
  }

  function openFrom(card) {
    // lightbox 浏览列表 = 当前筛选下的可见项
    const visibleCards = Array.from(
      document.querySelectorAll('.showcase-card:not(.is-hidden)')
    );
    lightboxList = visibleCards.map((c) => allItems[Number(c.dataset.index)]);
    const startIndex = visibleCards.indexOf(card);
    showAt(startIndex < 0 ? 0 : startIndex);
    lightbox.classList.remove('hidden');
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    resetMedia();
    lightboxIndex = -1;
  }

  function step(delta) {
    if (!lightboxList.length) return;
    const next = (lightboxIndex + delta + lightboxList.length) % lightboxList.length;
    showAt(next);
  }

  // 卡片点击（事件委托，覆盖筛选后仍存在的所有卡片）
  const grid = document.getElementById('showcase-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const media = e.target.closest('.showcase-card-media');
      if (!media) return;
      const card = media.closest('.showcase-card');
      if (card) openFrom(card);
    });
  }

  lightboxClose.addEventListener('click', closeLightbox);
  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
}
