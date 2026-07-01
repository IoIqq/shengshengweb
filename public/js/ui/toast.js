/**
 * Toast 通知系统
 * 独立的通知组件，可在任何项目中复用
 */

export const Toast = {
  container: null,
  queue: [],
  maxVisible: 3,
  defaultDuration: 4000,

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(this.container);
    }
  },

  show(options) {
    if (!this.container) this.init();

    const {
      title = '',
      message = '',
      tone = 'info',
      duration = this.defaultDuration,
      closeable = true,
    } = typeof options === 'string' ? { message: options } : options;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('data-tone', tone);
    toast.setAttribute('role', 'alert');

    const iconMap = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    toast.innerHTML = `
      <div class="toast-icon">${iconMap[tone] || iconMap.info}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      ${closeable ? '<button class="toast-close" type="button" aria-label="关闭">✕</button>' : ''}
    `;

    if (closeable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn?.addEventListener('click', () => this.remove(toast));
    }

    this.container.appendChild(toast);
    this.queue.push(toast);

    // 限制同时显示的数量
    if (this.queue.length > this.maxVisible) {
      const oldest = this.queue.shift();
      if (oldest) this.remove(oldest);
    }

    // 触发动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });
    });

    // 自动关闭
    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  },

  remove(toast) {
    if (!toast || !toast.isConnected) return;

    toast.classList.remove('is-visible');
    setTimeout(() => {
      if (toast.isConnected) {
        toast.remove();
        const index = this.queue.indexOf(toast);
        if (index > -1) this.queue.splice(index, 1);
      }
    }, 300);
  },

  success(message, title = '') {
    return this.show({ message, title, tone: 'success' });
  },

  error(message, title = '') {
    return this.show({ message, title, tone: 'error', duration: 6000 });
  },

  warning(message, title = '') {
    return this.show({ message, title, tone: 'warning' });
  },

  info(message, title = '') {
    return this.show({ message, title, tone: 'info' });
  },

  clear() {
    this.queue.forEach((t) => { if (t.isConnected) t.remove(); });
    this.queue = [];
  },

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },
};

// 初始化并暴露全局方法
Toast.init();
window.showToast = (message, tone = 'info') => {
  Toast.show({ message, tone });
};
