/**
 * Dialog 组件 - 自定义确认对话框
 * 替换原生 confirm() 提供更好的用户体验
 */

import { Toast } from './toast.js';

export const Dialog = {
  /**
   * 显示确认对话框
   * @param {Object} options - 配置选项
   * @param {string} options.title - 对话框标题
   * @param {string} options.message - 对话框消息
   * @param {string} [options.confirmText='确定'] - 确认按钮文本
   * @param {string} [options.cancelText='取消'] - 取消按钮文本
   * @param {string} [options.variant='info'] - 变体：danger/warning/info
   * @returns {Promise<boolean>} - 用户确认返回 true，取消返回 false
   */
  confirm({
    title = '确认操作',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    variant = 'info'
  }) {
    return new Promise((resolve) => {
      // 创建对话框 DOM
      const dialog = document.createElement('div');
      dialog.className = 'dialog-overlay';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'dialog-title');
      dialog.setAttribute('aria-describedby', 'dialog-message');

      dialog.innerHTML = `
        <div class="dialog-container">
          <div class="dialog-header">
            <h3 id="dialog-title" class="dialog-title">${this._escapeHtml(title)}</h3>
          </div>
          <div class="dialog-body">
            <p id="dialog-message" class="dialog-message">${this._escapeHtml(message)}</p>
          </div>
          <div class="dialog-footer">
            <button type="button" class="dialog-btn dialog-btn-cancel">${this._escapeHtml(cancelText)}</button>
            <button type="button" class="dialog-btn dialog-btn-confirm dialog-btn-${variant}">${this._escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      // 添加到 DOM
      document.body.appendChild(dialog);

      // 保存之前的焦点元素
      const previousFocusElement = document.activeElement;

      // 获取按钮元素
      const confirmBtn = dialog.querySelector('.dialog-btn-confirm');
      const cancelBtn = dialog.querySelector('.dialog-btn-cancel');
      const container = dialog.querySelector('.dialog-container');

      // 焦点移到确认按钮
      setTimeout(() => {
        confirmBtn.focus();
      }, 100);

      // 关闭对话框的函数
      const close = (result) => {
        dialog.classList.add('dialog-closing');
        setTimeout(() => {
          dialog.remove();
          // 恢复焦点
          if (previousFocusElement && previousFocusElement.focus) {
            previousFocusElement.focus();
          }
          resolve(result);
        }, 200);
      };

      // 确认按钮
      confirmBtn.addEventListener('click', () => {
        close(true);
      });

      // 取消按钮
      cancelBtn.addEventListener('click', () => {
        close(false);
      });

      // 点击遮罩关闭（取消）
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          close(false);
        }
      });

      // ESC 键关闭
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

      // Tab 焦点捕获（在对话框内循环）
      const handleTab = (e) => {
        if (e.key === 'Tab') {
          const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };
      dialog.addEventListener('keydown', handleTab);

      // 动画
      requestAnimationFrame(() => {
        dialog.classList.add('dialog-active');
      });
    });
  },

  /**
   * 显示带表单的模态对话框（抽取自各模块重复的弹窗样板）。
   * 负责：创建遮罩外壳、插入 body、关闭按钮/取消按钮/遮罩点击/Esc 关闭、
   * Tab 焦点捕获、初始聚焦、提交处理与失败 Toast。调用方只提供表单内容与提交逻辑。
   *
   * @param {Object} options
   * @param {string} options.title - 标题
   * @param {string} options.formId - 表单元素 id（供 querySelector 定位）
   * @param {string} options.bodyHtml - 表单内部字段 HTML（不含 <form> 与操作按钮）
   * @param {string} [options.submitText='保存'] - 提交按钮文本
   * @param {(data: Object, ctx: { close: Function, form: HTMLFormElement }) => (void|Promise<void>)} options.onSubmit
   *        - 提交回调，收到 FormData 解析后的对象；抛错则弹 Toast 且不关闭对话框。
   *          回调内可调用 ctx.close() 自行关闭；默认成功后自动关闭。
   * @param {boolean} [options.autoClose=true] - onSubmit 成功后是否自动关闭
   */
  form({ title, formId, bodyHtml, submitText = '保存', onSubmit, autoClose = true }) {
    const titleId = `dialog-form-title-${Date.now()}`;
    const previousFocusElement = document.activeElement;

    const dialog = document.createElement('div');
    dialog.className = 'user-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.innerHTML = `
      <div class="user-dialog-content">
        <div class="user-dialog-header">
          <h3 id="${titleId}">${this._escapeHtml(title)}</h3>
          <button class="user-dialog-close" type="button" aria-label="关闭${this._escapeHtml(title)}">&times;</button>
        </div>
        <form class="user-dialog-form" id="${formId}">
          ${bodyHtml}
          <div class="user-dialog-actions">
            <button class="ghost-btn" type="button" data-action="cancel">取消</button>
            <button class="primary-btn" type="submit">${this._escapeHtml(submitText)}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(dialog);

    const form = dialog.querySelector(`#${formId}`);
    const closeBtn = dialog.querySelector('.user-dialog-close');
    const cancelBtn = dialog.querySelector('[data-action="cancel"]');
    const firstField = form.querySelector('input:not([readonly]), select, textarea, button');

    const close = () => {
      dialog.remove();
      if (previousFocusElement && typeof previousFocusElement.focus === 'function') {
        previousFocusElement.focus();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll(
        'button, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
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
    };

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    dialog.addEventListener('keydown', handleKeydown);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });

    requestAnimationFrame(() => firstField?.focus());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      try {
        await onSubmit(data, { close, form });
        if (autoClose) close();
      } catch (error) {
        console.error('操作失败：', error);
        Toast.error(error.message || '操作失败');
      }
    });

    return { dialog, form, close };
  },

  /**
   * 转义 HTML，防止 XSS
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
