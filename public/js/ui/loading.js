/**
 * 加载动画和骨架屏模块
 * 提供全局加载指示器、骨架屏组件等
 */

// ============================================================================
// 全局加载进度条
// ============================================================================

class LoadingBar {
  constructor() {
    this.bar = null;
    this.progress = 0;
    this.isLoading = false;
    this.timer = null;
    this.init();
  }

  init() {
    // 创建进度条元素
    this.bar = document.createElement('div');
    this.bar.className = 'loading-bar';
    this.bar.innerHTML = '<div class="loading-bar-progress"></div>';
    document.body.appendChild(this.bar);
  }

  start() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.progress = 0;
    this.bar.classList.add('is-loading');

    // 模拟进度增长
    this.timer = setInterval(() => {
      if (this.progress < 90) {
        this.progress += Math.random() * 10;
        this.updateProgress();
      }
    }, 200);
  }

  updateProgress() {
    const progressBar = this.bar.querySelector('.loading-bar-progress');
    if (progressBar) {
      progressBar.style.width = `${Math.min(this.progress, 100)}%`;
    }
  }

  finish() {
    if (!this.isLoading) return;

    clearInterval(this.timer);
    this.progress = 100;
    this.updateProgress();

    // 完成动画后隐藏
    setTimeout(() => {
      this.bar.classList.remove('is-loading');
      this.isLoading = false;
      this.progress = 0;
      this.updateProgress();
    }, 300);
  }

  error() {
    if (!this.isLoading) return;

    clearInterval(this.timer);
    this.bar.classList.add('is-error');

    setTimeout(() => {
      this.bar.classList.remove('is-loading', 'is-error');
      this.isLoading = false;
      this.progress = 0;
      this.updateProgress();
    }, 1000);
  }
}

// 创建全局实例
export const loadingBar = new LoadingBar();

// ============================================================================
// 骨架屏生成器
// ============================================================================

export function createSkeleton(type = 'card', count = 1) {
  const skeletons = [];

  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-useless-assignment
    let html = '';

    switch (type) {
      case 'card':
        html = `
          <div class="skeleton-card">
            <div class="skeleton skeleton-media"></div>
            <div class="skeleton-card-body">
              <div class="skeleton skeleton-text large"></div>
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text small"></div>
            </div>
          </div>
        `;
        break;

      case 'list':
        html = `
          <div class="skeleton-list-item">
            <div class="skeleton skeleton-avatar"></div>
            <div class="skeleton-list-content">
              <div class="skeleton skeleton-text large"></div>
              <div class="skeleton skeleton-text"></div>
            </div>
          </div>
        `;
        break;

      case 'stat':
        html = `
          <div class="skeleton-stat">
            <div class="skeleton skeleton-text small"></div>
            <div class="skeleton skeleton-text large"></div>
          </div>
        `;
        break;

      case 'form':
        html = `
          <div class="skeleton-form">
            <div class="skeleton skeleton-text small"></div>
            <div class="skeleton skeleton-input"></div>
          </div>
        `;
        break;

      default:
        html = '<div class="skeleton skeleton-text"></div>';
    }

    skeletons.push(html);
  }

  return skeletons.join('');
}

// ============================================================================
// 按钮加载状态
// ============================================================================

export function setButtonLoading(button, loading = true) {
  if (!button) return;

  if (loading) {
    button.disabled = true;
    button.classList.add('is-loading');

    // 保存原始内容
    if (!button.dataset.originalContent) {
      button.dataset.originalContent = button.innerHTML;
    }

    // 添加加载图标
    const spinner = '<span class="btn-spinner"></span>';
    button.innerHTML = spinner + button.dataset.originalContent;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');

    // 恢复原始内容
    if (button.dataset.originalContent) {
      button.innerHTML = button.dataset.originalContent;
    }
  }
}

// ============================================================================
// 涟漪效果
// ============================================================================

export function addRippleEffect(element) {
  if (!element) return;

  element.addEventListener('click', function (e) {
    // 移除旧的涟漪
    const oldRipple = this.querySelector('.ripple');
    if (oldRipple) {
      oldRipple.remove();
    }

    // 创建新涟漪
    const ripple = document.createElement('span');
    ripple.className = 'ripple';

    // 计算位置
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    this.appendChild(ripple);

    // 动画结束后移除
    setTimeout(() => ripple.remove(), 600);
  });
}

// ============================================================================
// 自动为按钮添加涟漪效果
// ============================================================================

export function initRippleEffects() {
  const buttons = document.querySelectorAll('.primary-btn, .ghost-btn, .nav-chip');
  buttons.forEach(button => {
    if (!button.classList.contains('ripple-enabled')) {
      button.classList.add('ripple-enabled');
      addRippleEffect(button);
    }
  });
}

// ============================================================================
// 图片懒加载
// ============================================================================

export function initLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;

          // 加载图片
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }

          // 添加淡入动画
          img.classList.add('lazy-loaded');

          // 停止观察
          observer.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px'
    });

    // 观察所有懒加载图片
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  } else {
    // 降级：直接加载所有图片
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }
}

// ============================================================================
// 平滑滚动到元素
// ============================================================================

export function smoothScrollTo(element, offset = 0) {
  if (!element) return;

  const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - offset;

  window.scrollTo({
    top: targetPosition,
    behavior: 'smooth'
  });
}

// ============================================================================
// 页面可见性检测
// ============================================================================

export function onPageVisible(callback) {
  if (typeof callback !== 'function') return;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      callback();
    }
  });
}

// ============================================================================
// 暴露到全局
// ============================================================================

window.LoadingUI = {
  loadingBar,
  createSkeleton,
  setButtonLoading,
  addRippleEffect,
  initRippleEffects,
  initLazyLoading,
  smoothScrollTo,
  onPageVisible
};

console.log('✅ 加载动画模块已加载');
