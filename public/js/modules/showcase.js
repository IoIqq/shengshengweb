import { request } from '../utils/api.js';
import { escapeHtml } from '../utils/helpers.js';

// 当前数据与浏览状态
let allItems = [];
let currentFilter = 'all';
let lightboxList = []; // 当前可见项（按筛选过滤），lightbox 导航基于它
let lightboxIndex = -1;
let previouslyFocused = null;

// 占位 SVG（图片加载失败时与空状态同款图标）
const FALLBACK_SVG = `<span class="img-fallback" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
</span>`;

export async function loadShowcase() {
  const grid = document.getElementById('showcase-grid');
  const empty = document.getElementById('showcase-empty');
  const countEl = document.getElementById('showcase-count');

  try {
    const data = await request('/api/media/showcase');
    allItems = data?.items || [];
    if (countEl) countEl.textContent = String(allItems.length).padStart(2, '0');
    updateFilterCounts();
    renderHeroCollage(allItems);

    if (!allItems.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      bindBackToTop();
      return;
    }
    empty.classList.add('hidden');
    renderShowcaseGallery(allItems, grid);
    bindLightbox();
    bindFilters();
    bindCardKeyboard(grid);
    bindBackToTop();
    revealCards(grid);
  } catch (error) {
    grid.innerHTML = '<div class="showcase-loading">载入失败，请稍后重试</div>';
    if (countEl) countEl.textContent = '00';
  }
}

/* --- Hero 拼贴：从已通过作品中取前 3 件填充实图，未上线时保留占位 --- */
function renderHeroCollage(items) {
  const collage = document.getElementById('showcase-hero-collage');
  if (!collage) return;
  const frames = collage.querySelectorAll('.hero-collage-frame');
  // 优先选有缩略图的前 3 件
  const picks = items.filter((it) => it.thumb).slice(0, frames.length);
  frames.forEach((frame, i) => {
    const item = picks[i];
    if (!item) return;
    const src = escapeHtml(item.thumb);
    const alt = escapeHtml(item.title || '');
    frame.classList.add('has-image');
    // 保留 tag 节点，仅在前面注入 img
    const existing = frame.querySelector('img');
    if (existing) {
      existing.src = src;
      existing.alt = alt;
    } else {
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      frame.insertBefore(img, frame.firstChild);
    }
  });
}

function renderShowcaseGallery(items, grid) {
  grid.innerHTML = items
    .map((item, index) => {
      const isVideo = item.kind === 'video';
      const thumbSrc = escapeHtml(item.thumb || '');
      const title = escapeHtml(item.title || '未命名');
      const author = escapeHtml(item.author || '');
      const kindLabel = isVideo ? 'FILM' : 'PHOTO';
      const ariaLabel = escapeHtml(
        `${item.title || '未命名'}${author ? ' · ' + (item.author || '') : ''} · ${isVideo ? '视频' : '图片'}`
      );

      const playOverlay = isVideo
        ? `<span class="showcase-play-icon" aria-hidden="true">
             <span>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.96)" stroke="none"><polygon points="6,4 20,12 6,20"/></svg>
             </span>
           </span>`
        : '';

      const mediaInner = thumbSrc
        ? `<img src="${thumbSrc}" alt="${title}" loading="lazy" decoding="async" />`
        : FALLBACK_SVG;

      return `
        <article class="showcase-card" data-index="${index}" data-kind="${isVideo ? 'video' : 'photo'}" style="--i:${index}" role="button" tabindex="0" aria-label="${ariaLabel}">
          <div class="showcase-card-media" data-src="${escapeHtml(item.url || '')}">
            ${mediaInner}
            ${playOverlay}
          </div>
          <div class="showcase-card-body">
            <strong>${title}</strong>
            <small>${author ? author + ' · ' : ''}${kindLabel}</small>
          </div>
        </article>`;
    })
    .join('');

  // 给所有缩略图绑定 onerror 回退（避免内联事件，CSP 友好）
  grid.querySelectorAll('.showcase-card-media img').forEach((img) => {
    img.addEventListener('error', () => {
      const parent = img.parentElement;
      if (!parent) return;
      img.remove();
      // 只在没有现成 fallback 时插入一次
      if (!parent.querySelector('.img-fallback')) {
        parent.insertAdjacentHTML('afterbegin', FALLBACK_SVG);
      }
    });
  });
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
    { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
  );
  cards.forEach((c) => io.observe(c));
}

/* --- 卡片键盘可达：Enter / Space 触发 lightbox --- */
function bindCardKeyboard(grid) {
  if (!grid || grid.dataset.kbBound) return;
  grid.dataset.kbBound = '1';

  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.showcase-card');
    if (!card) return;
    e.preventDefault();
    // 复用 lightbox 打开逻辑：模拟 click 在 .showcase-card-media 上
    const media = card.querySelector('.showcase-card-media');
    if (media) media.click();
  });
}

/* --- 回到顶部 --- */
function bindBackToTop() {
  const btn = document.getElementById('showcase-back-to-top');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
}

/* --- Lightbox（图片 + 视频 + 前后导航 + crossfade + focus-trap + counter）--- */
function bindLightbox() {
  const lightbox = document.getElementById('showcase-lightbox');
  const stage = document.getElementById('showcase-lightbox-stage');
  const lightboxImg = document.getElementById('showcase-lightbox-img');
  const lightboxVideo = document.getElementById('showcase-lightbox-video');
  const lightboxTitle = document.getElementById('showcase-lightbox-title');
  const lightboxSub = document.getElementById('showcase-lightbox-sub');
  const lightboxCounter = document.getElementById('showcase-lightbox-counter');
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
    const author = item.author || '';
    const kindLabel = isVideo ? 'FILM' : 'PHOTO';

    // 触发 crossfade：先淡出，250ms 后切源再淡入
    if (stage) stage.classList.add('is-switching');

    const apply = () => {
      resetMedia();
      if (isVideo && lightboxVideo) {
        lightboxVideo.classList.remove('hidden');
        lightboxVideo.src = item.url || '';
        lightboxVideo.play().catch(() => {});
      } else if (lightboxImg) {
        lightboxImg.classList.remove('hidden');
        lightboxImg.src = item.url || '';
        lightboxImg.alt = title;
      }
      if (lightboxTitle) lightboxTitle.textContent = title;
      if (lightboxSub) {
        lightboxSub.textContent = author ? `${author} · ${kindLabel}` : kindLabel;
      }
      if (lightboxCounter) {
        lightboxCounter.textContent =
          lightboxList.length > 1 ? `${index + 1} / ${lightboxList.length}` : '';
      }
      if (stage) {
        // 在下一帧解除 is-switching，确保 transition 触发
        requestAnimationFrame(() => stage.classList.remove('is-switching'));
      }
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      apply();
    } else {
      // 等待 CSS opacity 过渡的同步窗口
      setTimeout(apply, 180);
    }

    // 单件时隐藏前后箭头
    const multiple = lightboxList.length > 1;
    if (prevBtn) prevBtn.style.display = multiple ? '' : 'none';
    if (nextBtn) nextBtn.style.display = multiple ? '' : 'none';
  }

  function openFrom(card) {
    // lightbox 浏览列表 = 当前筛选下的可见项
    const visibleCards = Array.from(document.querySelectorAll('.showcase-card:not(.is-hidden)'));
    lightboxList = visibleCards.map((c) => allItems[Number(c.dataset.index)]);
    const startIndex = visibleCards.indexOf(card);
    previouslyFocused = document.activeElement;
    lightbox.classList.remove('hidden');
    showAt(startIndex < 0 ? 0 : startIndex);
    // 等图先就位再聚焦关闭按钮
    requestAnimationFrame(() => lightboxClose && lightboxClose.focus());
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    resetMedia();
    lightboxIndex = -1;
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
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

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // 键盘：Escape 关闭、左右箭头切换、Tab 焦点循环
  document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeLightbox();
      return;
    }
    if (e.key === 'ArrowLeft') {
      step(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      step(1);
      return;
    }
    if (e.key === 'Tab') {
      // focus-trap：在 close / prev / next 三个可见焦点之间循环
      const focusables = [lightboxClose, prevBtn, nextBtn].filter(
        (el) => el && el.offsetParent !== null
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !focusables.includes(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !focusables.includes(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
