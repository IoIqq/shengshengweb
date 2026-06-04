/**
 * Dialog 组件 - 自定义确认对话框
 * 替换原生 confirm() 提供更好的用户体验
 */

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
   * 转义 HTML，防止 XSS
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
