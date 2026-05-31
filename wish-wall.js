// 留言墙功能模块
(function() {
  'use strict';

  // 等待 DOM 加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const wishFab = document.getElementById('wish-fab');
    const wishModal = document.getElementById('wish-modal');
    const wishModalClose = document.getElementById('wish-modal-close');
    const wishModalOverlay = document.getElementById('wish-modal-overlay');
    const wishForm = document.getElementById('wish-form');
    const wishList = document.getElementById('wish-list');
    const wishCharCount = document.getElementById('wish-char-count');

    if (!wishFab || !wishModal) return;

    // 监听工作台显示状态：只在工作台可见时显示浮动按钮
    const workspaceShell = document.getElementById('workspace-shell');
    if (workspaceShell) {
      const syncFabVisibility = () => {
        const isWorkspaceVisible = !workspaceShell.classList.contains('hidden');
        wishFab.hidden = !isWorkspaceVisible;
        // 工作台不可见时也强制关闭留言墙
        if (!isWorkspaceVisible && !wishModal.hidden) {
          closeWishModal();
        }
      };
      // 初始同步一次
      syncFabVisibility();
      // 用 MutationObserver 监听 class 变化（登录/退出时会切换 hidden 类）
      const observer = new MutationObserver(syncFabVisibility);
      observer.observe(workspaceShell, { attributes: true, attributeFilter: ['class'] });
    }

    // 点击浮动按钮打开留言墙
    wishFab.addEventListener('click', openWishModal);

    // 关闭留言墙
    wishModalClose?.addEventListener('click', closeWishModal);
    wishModalOverlay?.addEventListener('click', closeWishModal);

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !wishModal.hidden) {
        closeWishModal();
      }
    });

    // 字符计数
    const contentTextarea = wishForm?.querySelector('textarea[name="content"]');
    if (contentTextarea && wishCharCount) {
      contentTextarea.addEventListener('input', () => {
        wishCharCount.textContent = contentTextarea.value.length;
      });
    }

    // 表单提交
    wishForm?.addEventListener('submit', handleSubmit);

    // 加载留言列表
    loadWishes();
  }

  function openWishModal() {
    const wishModal = document.getElementById('wish-modal');
    if (wishModal) {
      wishModal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      loadWishes(); // 打开时刷新列表
    }
  }

  function closeWishModal() {
    const wishModal = document.getElementById('wish-modal');
    if (wishModal) {
      wishModal.setAttribute('hidden', '');
      document.body.style.overflow = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {
      content: formData.get('content'),
      mood: formData.get('mood') || '',
      anonymous: formData.get('anonymous') === 'on'
    };

    try {
      const csrfToken = readCsrfToken();
      const response = await fetch('/api/wishes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        form.reset();
        document.getElementById('wish-char-count').textContent = '0';
        showToast('留言发布成功！', 'success');
        loadWishes();
      } else {
        const error = await response.json();
        showToast(error.error || '发布失败', 'error');
      }
    } catch (error) {
      console.error('发布留言失败:', error);
      showToast('网络错误，请稍后重试', 'error');
    }
  }

  async function loadWishes() {
    const wishList = document.getElementById('wish-list');
    if (!wishList) return;

    try {
      const response = await fetch('/api/wishes');
      if (!response.ok) throw new Error('加载失败');
      
      const wishes = await response.json();
      
      if (wishes.length === 0) {
        wishList.innerHTML = '<div class="wish-empty">还没有留言，快来发布第一条吧！</div>';
        return;
      }

      wishList.innerHTML = wishes.map(wish => `
        <div class="wish-item" data-id="${wish.id}">
          <div class="wish-item-header">
            <div class="wish-item-author">
              <span>${wish.author || '匿名用户'}</span>
              ${wish.mood ? `<span class="wish-item-mood">${wish.mood}</span>` : ''}
            </div>
          </div>
          <div class="wish-item-content">${escapeHtml(wish.content)}</div>
          <div class="wish-item-footer">
            <span class="wish-item-time">${formatTime(wish.createdAt || wish.created_at)}</span>
            ${isWishAdmin() ? `<button class="wish-item-delete" onclick="deleteWish(${wish.id})">删除</button>` : ""}
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('加载留言失败:', error);
      wishList.innerHTML = '<div class="wish-empty">加载失败，请刷新重试</div>';
    }
  }

  // 删除留言（全局函数，供 HTML 调用）
  window.deleteWish = async function(id) {
    if (!confirm('确定要删除这条留言吗？')) return;

    try {
      const csrfToken = readCsrfToken();
      const response = await fetch(`/api/wishes/${id}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      });

      if (response.ok) {
        showToast('删除成功', 'success');
        loadWishes();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除留言失败:', error);
      showToast('网络错误', 'error');
    }
  };

  function escapeHtml(text) {
    return window.shengshengUtils?.escapeHtml
      ? window.shengshengUtils.escapeHtml(text)
      : String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
  }

  function readCsrfToken() {
    return window.shengshengUtils?.readCookie
      ? window.shengshengUtils.readCookie('ss_csrf')
      : '';
  }

  function isWishAdmin() {
    return window.shengshengSession?.role === "admin";
  }

  window.addEventListener("shengsheng:session", () => {
    if (!document.getElementById("wish-modal")?.hasAttribute("hidden")) {
      loadWishes();
    }
  });

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  }

  function showToast(message, type = 'info') {
    window.showToast?.(message, type);
  }
})();
