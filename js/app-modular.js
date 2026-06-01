/**
 * 模块化应用主入口
 * 整合所有模块，替代原 app.js
 */

// ============================================================================
// 导入核心模块
// ============================================================================
import { state, resetState } from './core/state.js';
import { VIEW_LABELS } from './core/config.js';
import { els } from './core/dom.js';

// ============================================================================
// 导入工具模块
// ============================================================================
import { $$, getInitials, debounce } from './utils/helpers.js';
import { request, requestJSON } from './utils/api.js';

// ============================================================================
// 导入 UI 模块
// ============================================================================
import { Toast } from './ui/toast.js';
import { setActiveView, updateNavIndicator, setShellLoggedIn } from './ui/navigation.js';
import { setLoginPending, setPending, showFeedback, openProfilePopover, closeProfilePopover, setProfileFeedback, setProfilePwdHint } from './ui/feedback.js';
import { loadingBar, setButtonLoading, initRippleEffects, initLazyLoading } from './ui/loading.js';

// ============================================================================
// 导入业务模块
// ============================================================================
import { renderDashboard } from './modules/dashboard.js';
import { renderMedia, renderReview, reviewMedia, deleteMedia, toggleMediaSelection, clearMediaSelection, batchReviewMedia } from './modules/media.js';
import { renderTodos, createTodo, updateTodo, toggleTodo, deleteTodo, startEditTodo, cancelEditTodo, saveEditTodo } from './modules/todo.js';
import { renderTeam, createTeamMember, updateTeamMember, deleteTeamMember, moveTeamMember, startEditTeamMember, cancelEditTeamMember, saveEditTeamMember } from './modules/team.js';
import { renderDevices, createDevice, updateDevice, deleteDevice, startEditDevice, cancelEditDevice, syncDeviceView, refreshDevices } from './modules/device.js';
import { renderBorrowRequests, createBorrowRequest, approveBorrowRequest, returnBorrowRequest, deleteBorrowRequest, syncBorrowView, refreshBorrowRequests, renderBorrowDeviceSelect } from './modules/borrow.js';
import { renderSettings, updateSettings, copyToClipboard } from './modules/settings.js';

// ============================================================================
// 全局初始化
// ============================================================================
console.log('🚀 模块化应用启动...');
Toast.init();

// 暴露到全局（向后兼容）
window.Toast = Toast;

// ============================================================================
// 全局错误处理
// ============================================================================

// 捕获未处理的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ 未处理的 Promise 错误:', event.reason);

  // 阻止默认的错误提示
  event.preventDefault();

  // 显示友好的错误提示
  const message = event.reason?.message || '发生了一个错误';
  Toast.error(message);

  // 如果是 401 错误，提示重新登录
  if (event.reason?.status === 401) {
    setTimeout(() => {
      if (confirm('登录已过期，是否重新登录？')) {
        window.location.reload();
      }
    }, 1000);
  }
});

// 捕获全局 JavaScript 错误
window.addEventListener('error', (event) => {
  console.error('❌ 全局错误:', event.error || event.message);

  // 阻止默认的错误提示
  event.preventDefault();

  // 只在开发环境显示详细错误
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    Toast.error(`错误: ${event.message}`);
  } else {
    Toast.error('应用遇到了一个问题，请刷新页面重试');
  }
});

// 监听网络状态变化
window.addEventListener('online', () => {
  console.log('✅ 网络已连接');
  Toast.success('网络已恢复');
});

window.addEventListener('offline', () => {
  console.log('⚠️ 网络已断开');
  Toast.warning('网络连接已断开，请检查网络');
});

// ============================================================================
// 渲染所有视图
// ============================================================================
function renderAll() {
  if (!state.bootstrap) return;

  // 更新站点标题
  if (els.siteTitle) {
    els.siteTitle.textContent = state.bootstrap.site?.title || state.bootstrap.settings?.siteTitle || '工作台';
  }
  if (els.homeHeroMessage) {
    els.homeHeroMessage.textContent = state.bootstrap.site?.homeHeroMessage || '这里显示管理员配置的首页说明。';
  }

  // 渲染所有模块
  renderDashboard();
  renderMedia();
  renderReview();
  renderTodos();
  renderDevices();
  renderBorrowRequests();
  renderTeam();
  renderSettings();
  renderBorrowDeviceSelect();
}

// ============================================================================
// 事件绑定
// ============================================================================
function bindAllEvents() {
  bindNavigation();
  bindGlobalEvents();
  bindProfileEvents();
  bindMediaEvents();
  bindReviewEvents();
  bindTodoEvents();
  bindDeviceEvents();
  bindBorrowEvents();
  bindTeamEvents();
  bindSettingsEvents();
}

// 个人资料事件绑定
function bindProfileEvents() {
  // 打开个人资料弹窗
  if (els.userAvatarBtn) {
    els.userAvatarBtn.addEventListener('click', () => {
      openProfilePopover();
      syncProfileUI();
    });
  }

  // 关闭个人资料弹窗
  if (els.profileClose) {
    els.profileClose.addEventListener('click', () => {
      closeProfilePopover();
    });
  }

  // 点击弹窗外部关闭
  if (els.profilePopover) {
    els.profilePopover.addEventListener('click', (e) => {
      if (e.target === els.profilePopover) {
        closeProfilePopover();
      }
    });
  }

  // 保存资料按钮
  if (els.profileSaveBtn) {
    els.profileSaveBtn.addEventListener('click', async () => {
      await saveProfile();
    });
  }

  // 修改密码按钮
  if (els.profilePwdBtn) {
    els.profilePwdBtn.addEventListener('click', async () => {
      await changePassword();
    });
  }

  // 头像上传
  if (els.profileAvatarInput) {
    els.profileAvatarInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await uploadAvatar(e.target.files[0]);
      }
    });
  }
}

// 同步个人资料 UI
function syncProfileUI() {
  const user = state.session?.user;
  if (!user) return;

  // 更新预览信息
  if (els.profilePreviewName) {
    els.profilePreviewName.textContent = user.displayName || user.username;
  }
  if (els.profilePreviewSignature) {
    els.profilePreviewSignature.textContent = user.signature || '暂无签名';
  }
  if (els.profileAccountName) {
    els.profileAccountName.textContent = user.username;
  }
  if (els.profileAccountRole) {
    els.profileAccountRole.textContent = user.role === 'admin' ? '管理员' : '成员';
  }

  // 填充表单
  if (els.profileDisplayName) {
    els.profileDisplayName.value = user.displayName || '';
  }
  if (els.profileSignature) {
    els.profileSignature.value = user.signature || '';
  }
}

// 保存个人资料
async function saveProfile() {
  const displayName = els.profileDisplayName?.value?.trim();
  const signature = els.profileSignature?.value?.trim();

  try {
    setPending(true);
    const result = await requestJSON('/api/profile', {
      method: 'PATCH',
      body: { displayName, signature }
    });

    // 更新本地状态
    if (state.session?.user) {
      state.session.user.displayName = displayName;
      state.session.user.signature = signature;
    }

    setProfileFeedback('资料已保存', 'success');
    updateUserDisplay();
    syncProfileUI();
  } catch (error) {
    setProfileFeedback(error.message || '保存失败', 'error');
  } finally {
    setPending(false);
  }
}

// 修改密码
async function changePassword() {
  const oldPassword = els.profilePwdOld?.value;
  const newPassword = els.profilePwdNew?.value;
  const confirmPassword = els.profilePwdConfirm?.value;

  if (!oldPassword || !newPassword) {
    setProfilePwdHint('请填写当前密码和新密码', 'error');
    return;
  }

  if (newPassword.length < 6) {
    setProfilePwdHint('新密码至少 6 个字符', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setProfilePwdHint('两次输入的新密码不一致', 'error');
    return;
  }

  try {
    setPending(true);
    await requestJSON('/api/profile/password', {
      method: 'POST',
      body: { oldPassword, newPassword }
    });

    // 清空密码字段
    if (els.profilePwdOld) els.profilePwdOld.value = '';
    if (els.profilePwdNew) els.profilePwdNew.value = '';
    if (els.profilePwdConfirm) els.profilePwdConfirm.value = '';

    setProfilePwdHint('');
    setProfileFeedback('密码已修改', 'success');
  } catch (error) {
    setProfilePwdHint(error.message || '修改失败', 'error');
  } finally {
    setPending(false);
  }
}

// 上传头像
async function uploadAvatar(file) {
  try {
    setProfileFeedback('正在上传头像...', 'success');

    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch('/api/profile/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '上传失败');

    // 更新本地状态
    if (state.session?.user) {
      state.session.user.avatarUrl = data.avatarUrl;
    }

    setProfileFeedback('头像已更新', 'success');
    updateUserDisplay();
    syncProfileUI();
  } catch (error) {
    setProfileFeedback(error.message || '上传失败', 'error');
  }
}

// 全局事件绑定（处理动态生成的元素）
function bindGlobalEvents() {
  // 使用事件委托处理所有 [data-jump] 按钮
  document.addEventListener('click', (e) => {
    const jumpBtn = e.target.closest('[data-jump]');
    if (jumpBtn) {
      e.preventDefault();
      const view = jumpBtn.dataset.jump;
      if (view) {
        setActiveView(view);
        console.log('🔗 跳转到视图:', view);
      }
    }

    // 处理 .link-btn 链接按钮
    const linkBtn = e.target.closest('.link-btn[data-jump]');
    if (linkBtn) {
      e.preventDefault();
      const view = linkBtn.dataset.jump;
      if (view) {
        setActiveView(view);
      }
    }

    // 处理快捷操作按钮
    const shortcutBtn = e.target.closest('[data-shortcut]');
    if (shortcutBtn) {
      e.preventDefault();
      handleShortcut(shortcutBtn.dataset.shortcut);
    }
  });

  // 上传按钮
  if (els.uploadBtn) {
    els.uploadBtn.addEventListener('click', () => {
      handleShortcut('upload');
    });
  }

  // 同步按钮
  if (els.syncBtn) {
    els.syncBtn.addEventListener('click', () => {
      handleShortcut('sync');
    });
  }
}

// 处理快捷操作
function handleShortcut(action) {
  console.log('🎯 快捷操作:', action);

  switch (action) {
    case 'upload':
      // 触发文件上传
      Toast.info('上传功能：请在素材库页面使用上传按钮');
      setActiveView('media');
      break;

    case 'sync':
      // 同步服务器照片
      Toast.info('同步功能：请在素材库页面使用同步按钮');
      setActiveView('media');
      break;

    case 'jump-review':
      setActiveView('review');
      break;

    case 'jump-todo':
      setActiveView('todo');
      break;

    case 'jump-device':
      setActiveView('device');
      break;

    case 'jump-media':
      setActiveView('media');
      break;

    case 'jump-borrow':
      setActiveView('borrow');
      break;

    case 'backup':
      // 下载备份
      window.open('/api/backup', '_blank', 'noopener');
      Toast.success('正在准备备份文件...');
      break;

    default:
      console.warn('未知的快捷操作:', action);
  }
}

function bindNavigation() {
  // 导航按钮
  $$('.nav-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const view = chip.dataset.view;
      if (view) {
        setActiveView(view);
        console.log('📍 切换到视图:', view, VIEW_LABELS[view]);
      }
    });
  });

  // 刷新按钮
  if (els.refreshBtn) {
    els.refreshBtn.addEventListener('click', async () => {
      try {
        setPending(true);
        showFeedback('正在刷新...', 'info', state.activeView);
        await loadBootstrap();
        showFeedback('刷新成功', 'success', state.activeView);
      } catch (error) {
        Toast.error('刷新失败: ' + error.message);
      } finally {
        setPending(false);
      }
    });
  }

  // 登出按钮
  if (els.logoutBtn) {
    els.logoutBtn.addEventListener('click', async () => {
      try {
        await requestJSON('/api/logout', { method: 'POST' });
        Toast.success('已退出登录');
        resetState();
        setShellLoggedIn(false);
      } catch (error) {
        Toast.error('退出失败: ' + error.message);
      }
    });
  }
}

function bindMediaEvents() {
  // 素材搜索
  if (els.mediaSearch) {
    els.mediaSearch.addEventListener('input', debounce((e) => {
      state.mediaSearch = e.target.value;
      renderMedia();
    }, 300));
  }

  // 素材排序
  if (els.mediaSort) {
    els.mediaSort.addEventListener('change', (e) => {
      state.mediaSort = e.target.value;
      renderMedia();
    });
  }

  // 素材过滤
  if (els.mediaFilters) {
    els.mediaFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      $$('[data-filter]', els.mediaFilters).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.mediaFilter = btn.dataset.filter;
      renderMedia();
    });
  }

  // 素材操作（使用事件委托）
  if (els.mediaGrid) {
    els.mediaGrid.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('[data-media-review]');
      const deleteBtn = e.target.closest('[data-media-delete]');
      const selectBox = e.target.closest('[data-media-select]');
      const batchBtn = e.target.closest('[data-batch-action]');
      const previewBtn = e.target.closest('[data-media-preview]');

      if (reviewBtn) {
        const id = reviewBtn.dataset.id;
        const status = reviewBtn.dataset.mediaReview;
        await reviewMedia(id, status);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.mediaDelete;
        await deleteMedia(id);
      } else if (selectBox) {
        const id = selectBox.dataset.mediaSelect;
        toggleMediaSelection(id);
      } else if (previewBtn) {
        const id = previewBtn.dataset.mediaPreview;
        previewMedia(id);
      } else if (batchBtn) {
        const action = batchBtn.dataset.batchAction;
        if (action === 'clear') {
          clearMediaSelection();
        } else if (action === 'approve') {
          await batchReviewMedia('approved');
        } else if (action === 'reject') {
          await batchReviewMedia('rejected');
        }
      }
    });
  }
}

// 预览素材
function previewMedia(id) {
  const media = (state.bootstrap?.media || []).find((m) => m.id === id);
  if (!media) {
    Toast.error('找不到该素材');
    return;
  }

  // 打开新窗口预览
  const url = media.url || media.thumb;
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Toast.warning('该素材没有可预览的链接');
  }
}

function bindReviewEvents() {
  if (els.reviewStack) {
    els.reviewStack.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('[data-media-review]');
      const deleteBtn = e.target.closest('[data-media-delete]');

      if (reviewBtn) {
        const id = reviewBtn.dataset.id;
        const status = reviewBtn.dataset.mediaReview;
        const noteInput = els.reviewStack.querySelector(`[data-review-note-for="${id}"]`);
        const note = noteInput ? noteInput.value : '';
        await reviewMedia(id, status, note);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.mediaDelete;
        await deleteMedia(id);
      }
    });
  }
}

function bindTodoEvents() {
  // 待办表单
  if (els.todoForm) {
    els.todoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.todoForm);
      await createTodo(formData);
    });
  }

  // 待办操作
  if (els.todoList) {
    els.todoList.addEventListener('click', async (e) => {
      const toggleBox = e.target.closest('[data-todo-toggle]');
      const deleteBtn = e.target.closest('[data-todo-delete]');
      const editForm = e.target.closest('[data-todo-edit-form]');
      const cancelBtn = e.target.closest('[data-todo-edit-cancel]');
      const todoItem = e.target.closest('[data-todo-id]');

      if (toggleBox) {
        const id = toggleBox.dataset.todoToggle;
        await toggleTodo(id);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.todoDelete;
        await deleteTodo(id);
      } else if (cancelBtn) {
        cancelEditTodo();
      } else if (editForm) {
        e.preventDefault();
        const id = editForm.dataset.todoEditForm;
        const formData = new FormData(editForm);
        await saveEditTodo(id, formData);
      } else if (todoItem && !e.target.closest('[data-todo-edit-skip]')) {
        const id = todoItem.dataset.todoId;
        if (state.todoEditingId !== id) {
          startEditTodo(id);
        }
      }
    });
  }
}

function bindDeviceEvents() {
  // 设备表单
  if (els.deviceForm) {
    els.deviceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.deviceForm);
      const id = els.deviceFormId?.value;

      if (id) {
        await updateDevice(id, Object.fromEntries(formData));
      } else {
        await createDevice(formData);
      }
    });
  }

  // 设备取消编辑
  if (els.deviceFormCancel) {
    els.deviceFormCancel.addEventListener('click', () => {
      cancelEditDevice();
    });
  }

  // 设备搜索
  if (els.deviceSearch) {
    els.deviceSearch.addEventListener('input', debounce((e) => {
      state.deviceSearch = e.target.value;
      syncDeviceView();
    }, 300));
  }

  // 设备过滤
  if (els.deviceFilters) {
    els.deviceFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      $$('[data-filter]', els.deviceFilters).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.deviceFilter = btn.dataset.filter;
      syncDeviceView();
    });
  }

  // 设备刷新
  if (els.deviceRefreshBtn) {
    els.deviceRefreshBtn.addEventListener('click', () => {
      refreshDevices({ scope: 'catalog' });
    });
  }

  // 设备操作
  if (els.deviceList) {
    els.deviceList.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-device-edit]');
      const deleteBtn = e.target.closest('[data-device-delete]');

      if (editBtn) {
        const id = editBtn.dataset.deviceEdit;
        startEditDevice(id);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.deviceDelete;
        await deleteDevice(id);
      }
    });
  }
}

function bindBorrowEvents() {
  // 借出表单
  if (els.borrowForm) {
    els.borrowForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.borrowForm);
      await createBorrowRequest(formData);
    });
  }

  // 借出搜索
  if (els.borrowSearch) {
    els.borrowSearch.addEventListener('input', debounce((e) => {
      state.borrowSearch = e.target.value;
      syncBorrowView();
    }, 300));
  }

  // 借出过滤
  if (els.borrowFilters) {
    els.borrowFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      $$('[data-filter]', els.borrowFilters).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.borrowFilter = btn.dataset.filter;
      syncBorrowView();
    });
  }

  // 借出刷新
  if (els.borrowRefreshBtn) {
    els.borrowRefreshBtn.addEventListener('click', () => {
      refreshBorrowRequests({ scope: 'catalog' });
    });
  }

  // 借出操作
  if (els.borrowList) {
    els.borrowList.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('[data-borrow-approve]');
      const rejectBtn = e.target.closest('[data-borrow-reject]');
      const returnBtn = e.target.closest('[data-borrow-return]');
      const deleteBtn = e.target.closest('[data-borrow-delete]');

      if (approveBtn) {
        const id = approveBtn.dataset.borrowApprove;
        await approveBorrowRequest(id, 'approved');
      } else if (rejectBtn) {
        const id = rejectBtn.dataset.borrowReject;
        await approveBorrowRequest(id, 'rejected');
      } else if (returnBtn) {
        const id = returnBtn.dataset.borrowReturn;
        await returnBorrowRequest(id);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.borrowDelete;
        await deleteBorrowRequest(id);
      }
    });
  }
}

function bindTeamEvents() {
  // 团队表单
  if (els.teamForm) {
    els.teamForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.teamForm);
      const id = els.teamFormId?.value;

      if (id) {
        await saveEditTeamMember(id, formData);
      } else {
        await createTeamMember(formData);
      }
    });
  }

  // 团队添加按钮
  if (els.teamAddBtn) {
    els.teamAddBtn.addEventListener('click', () => {
      if (els.teamForm) {
        els.teamForm.hidden = !els.teamForm.hidden;
      }
    });
  }

  // 团队取消按钮
  if (els.teamFormCancel) {
    els.teamFormCancel.addEventListener('click', () => {
      cancelEditTeamMember();
      if (els.teamForm) els.teamForm.hidden = true;
    });
  }

  // 团队搜索
  if (els.teamSearch) {
    els.teamSearch.addEventListener('input', debounce((e) => {
      state.teamSearch = e.target.value;
      renderTeam();
    }, 300));
  }

  // 团队排序
  if (els.teamSort) {
    els.teamSort.addEventListener('change', (e) => {
      state.teamSort = e.target.value;
      renderTeam();
    });
  }

  // 团队过滤
  if (els.teamFilters) {
    els.teamFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      $$('[data-filter]', els.teamFilters).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.teamFilter = btn.dataset.filter;
      renderTeam();
    });
  }

  // 团队操作
  if (els.teamGrid) {
    els.teamGrid.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-team-edit]');
      const deleteBtn = e.target.closest('[data-team-delete]');
      const moveUpBtn = e.target.closest('[data-team-move-up]');
      const moveDownBtn = e.target.closest('[data-team-move-down]');

      if (editBtn) {
        const id = editBtn.dataset.teamEdit;
        startEditTeamMember(id);
        if (els.teamForm) els.teamForm.hidden = false;
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.teamDelete;
        await deleteTeamMember(id);
      } else if (moveUpBtn) {
        const id = moveUpBtn.dataset.teamMoveUp;
        await moveTeamMember(id, 'up');
      } else if (moveDownBtn) {
        const id = moveDownBtn.dataset.teamMoveDown;
        await moveTeamMember(id, 'down');
      }
    });
  }
}

function bindSettingsEvents() {
  // 设置表单
  if (els.settingsForm) {
    els.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(els.settingsForm);
      await updateSettings(formData);
    });
  }

  // 复制按钮
  if (els.systemCard) {
    els.systemCard.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy-text]');
      if (copyBtn) {
        const text = copyBtn.dataset.copyText;
        await copyToClipboard(text);
      }
    });
  }
}

// ============================================================================
// 登录处理
// ============================================================================
function bindLoginForm() {
  if (!els.loginForm) return;

  // 密码显示/隐藏切换按钮
  const passwordToggle = document.getElementById('login-password-toggle');
  const passwordInput = document.getElementById('login-password');

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isPressed = passwordToggle.getAttribute('aria-pressed') === 'true';
      passwordToggle.setAttribute('aria-pressed', String(!isPressed));
      passwordInput.type = isPressed ? 'password' : 'text';
      passwordToggle.setAttribute('aria-label', isPressed ? '显示密码' : '隐藏密码');
    });
  }

  // Caps Lock 检测
  if (passwordInput) {
    const capsLockHint = document.getElementById('caps-lock-hint');
    if (capsLockHint) {
      passwordInput.addEventListener('keyup', (e) => {
        capsLockHint.hidden = !e.getModifierState('CapsLock');
      });
    }
  }

  // 登录表单提交
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(els.loginForm);
    const username = formData.get('username');
    const password = formData.get('password');

    if (!username || !password) {
      Toast.warning('请输入用户名和密码');
      return;
    }

    try {
      setLoginPending(true);

      const result = await requestJSON('/api/login', {
        method: 'POST',
        body: { username, password }
      });

      if (result.success || result.session) {
        Toast.success('登录成功');
        state.session = result.session || result;

        // 加载数据
        await loadBootstrap();

        // 显示工作区
        setShellLoggedIn(true);
        updateUserDisplay();
        bindAllEvents();
        renderAll();
        setActiveView(state.activeView);
      } else {
        Toast.error(result.message || '登录失败');
      }
    } catch (error) {
      console.error('登录失败:', error);
      Toast.error(error.message || '登录失败');
    } finally {
      setLoginPending(false);
    }
  });
}

// ============================================================================
// 数据加载
// ============================================================================
async function loadBootstrap() {
  // 显示加载进度条
  loadingBar.start();

  try {
    const data = await request('/api/bootstrap');
    state.bootstrap = data;
    state.deviceCatalog = Array.isArray(data.devices) ? data.devices : [];
    state.borrowCatalog = Array.isArray(data.borrowRequests) ? data.borrowRequests : [];
    syncDeviceView();
    syncBorrowView();
    renderAll();

    // 完成加载
    loadingBar.finish();
  } catch (error) {
    // 加载失败
    loadingBar.error();
    throw error;
  }
}

function updateUserDisplay() {
  const user = state.session?.user;
  if (!user) return;

  if (els.userAvatarInitials) {
    els.userAvatarInitials.textContent = getInitials(user.displayName || user.username);
  }

  if (els.rolePill) {
    els.rolePill.textContent = user.role === 'admin' ? '管理员工作台' : '成员工作台';
  }

  if (els.roleTitle) {
    els.roleTitle.textContent = user.displayName ? `欢迎回来，${user.displayName}` : '欢迎回来';
  }
}

// ============================================================================
// 应用启动
// ============================================================================
async function start() {
  try {
    console.log('📦 加载会话数据...');

    const sessionData = await request('/api/session').catch(() => null);
    state.session = sessionData;

    if (state.session?.user) {
      console.log('✅ 用户已登录:', state.session.user.username);

      await loadBootstrap();

      setShellLoggedIn(true);
      updateUserDisplay();
      bindAllEvents();
      setActiveView(state.activeView);

      Toast.success('欢迎回来，' + state.session.user.username);
    } else {
      console.log('ℹ️ 用户未登录');
      setShellLoggedIn(false);
    }
  } catch (error) {
    console.error('❌ 启动失败:', error);
    Toast.error('应用启动失败');
    setShellLoggedIn(false);
  }
}

// ============================================================================
// DOM 就绪后执行
// ============================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bindLoginForm();
    start();

    // 初始化 UX 增强功能
    setTimeout(() => {
      initRippleEffects();
      initLazyLoading();
      console.log('✨ UX 增强功能已初始化');
    }, 500);
  });
} else {
  bindLoginForm();
  start();

  // 初始化 UX 增强功能
  setTimeout(() => {
    initRippleEffects();
    initLazyLoading();
    console.log('✨ UX 增强功能已初始化');
  }, 500);
}

console.log('✅ 模块化应用已加载');
