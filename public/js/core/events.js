/**
 * 工作台事件绑定
 *
 * 汇总所有面板的事件委托与表单绑定、快捷操作处理与设置页标签切换。
 * 由 bootstrap.js 在登录成功后统一调用 bindAllEvents()。
 */

import { state, resetState } from './state.js';
import { VIEW_LABELS } from './config.js';
import { els } from './dom.js';
import { $$, debounce } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import * as log from '../utils/log.js';
import { setActiveView } from '../ui/navigation.js';
import { openMediaPreview } from '../ui/media-preview.js';
import { setPending, showFeedback } from '../ui/feedback.js';
import { flashSuccess, resetDashboardCountUpFlag } from '../ui/animations.js';
import { loadShowcase } from '../modules/showcase.js';
import {
  canAccessView,
  canManageMedia,
  canUploadMedia,
  canManageDevices,
  currentRole,
} from './router.js';
import { loadBootstrap, showShowcaseShell } from './bootstrap.js';
import { bindProfileEvents } from './profile.js';
import {
  renderActivity,
  initActivityFilters,
  resetDashboardState,
  initUploadDialog,
  initDedup,
  initMediaViewSwitcher,
  openUploadDialog,
  renderMedia,
  reviewMedia,
  deleteMedia,
  toggleMediaSelection,
  clearMediaSelection,
  batchReviewMedia,
  renderReview,
  createTodo,
  toggleTodo,
  deleteTodo,
  cancelEditTodo,
  saveEditTodo,
  startEditTodo,
  updateDevice,
  createDevice,
  cancelEditDevice,
  syncDeviceView,
  refreshDevices,
  loadDeviceOptions,
  uploadDeviceImage,
  setDeviceImagePreview,
  startEditDevice,
  deleteDevice,
  createBorrowRequest,
  syncBorrowView,
  refreshBorrowRequests,
  approveBorrowRequest,
  returnBorrowRequest,
  deleteBorrowRequest,
  cancelBorrowRequest,
  saveEditTeamMember,
  createTeamMember,
  cancelEditTeamMember,
  renderTeam,
  startEditTeamMember,
  deleteTeamMember,
  moveTeamMember,
  updateSettings,
  copyToClipboard,
  restoreBackup,
  initUsers,
  initAuditLogs,
  loadStorageStatus,
  bindTopicsEvents,
  bindStorageEvents,
  initWishWall,
  renderSystemPanel,
  refreshSystemInfo,
  loadSystemLogs,
  loadNetworkInfo,
  restartService,
  loadLogFileList,
  searchLogs,
  loadFeishuSyncStatus,
  runFeishuSync,
  initPreferencesPanel,
  initMaintenancePanel,
  resetAuditState,
  bindFileBrowserEvents,
  bindMonitorEvents,
  bindServicesEvents,
  bindHostEvents,
} from './proxies.js';

/**
 * 绑定所有工作台事件（登录成功后调用）
 * 幂等：DOM 是持久的（mountPanels 只挂载一次），监听器也只需绑定一次，
 * 登出时不重置该标志，避免再登录时给同一批 DOM 元素叠加重复监听器。
 */
let eventsBound = false;

export function bindAllEvents() {
  if (eventsBound) {
    log.log('ℹ️ 事件已绑定，跳过重复绑定');
    return;
  }
  eventsBound = true;

  bindNavigation();
  bindGlobalEvents();
  bindProfileEvents();
  bindMediaEvents();
  bindReviewEvents();
  bindTodoEvents();
  bindDeviceEvents();
  bindBorrowEvents();
  bindTeamEvents();
  bindTopicsEvents();
  bindSettingsEvents();
  bindSettingsTabs();
  bindStorageEvents();
  bindSystemAdminEvents();
  bindFileBrowserEvents();
  bindMonitorEvents();
  bindServicesEvents();
  bindHostEvents();
  initWishWall();
}

// 全局事件绑定（处理动态生成的元素）
function bindGlobalEvents() {
  // 使用事件委托处理所有 [data-jump] 按钮
  document.addEventListener('click', (e) => {
      const jumpBtn = e.target.closest('[data-jump]');
      if (jumpBtn) {
        e.preventDefault();
        const view = jumpBtn.dataset.jump;
        if (view && canAccessView(view)) {
          setActiveView(view);
          log.log('🔗 跳转到视图:', view);
        }
      }

      // 处理快捷操作按钮
      const shortcutBtn = e.target.closest('[data-shortcut]');
      if (shortcutBtn) {
        e.preventDefault();
        handleShortcut(shortcutBtn.dataset.shortcut);
      }
    });

  document.addEventListener('activity-updated', () => {
    renderActivity();
  });

  // 上传按钮
  if (els.uploadBtn) {
    els.uploadBtn.addEventListener('click', () => {
      handleShortcut('upload');
    });
  }

  // 同步按钮 — 已禁用（点击不再触发视图切换）
}

// 处理快捷操作
async function handleShortcut(action) {
  log.log('🎯 快捷操作:', action);

  switch (action) {
    case 'upload':
      if (!canUploadMedia()) {
        Toast.warning('当前身份无权上传素材');
        break;
      }
      setActiveView('media');
      requestAnimationFrame(() => openUploadDialog());
      break;

    case 'sync':
      if (!['admin', 'editor'].includes(currentRole())) {
        Toast.warning('当前身份无权同步素材');
        break;
      }
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

    case 'jump-team':
      setActiveView('team');
      break;

    case 'jump-borrow':
      setActiveView('borrow');
      break;

    case 'backup':
      if (currentRole() !== 'admin') {
        Toast.warning('当前身份无权下载备份');
        break;
      }
      // 下载备份
      window.open('/api/backup', '_blank', 'noopener');
      Toast.success('正在准备备份文件...');
      flashSuccess(document.querySelector('[data-shortcut="backup"]'));
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
      if (view && canAccessView(view)) {
        setActiveView(view);
        log.log('📍 切换到视图:', view, VIEW_LABELS[view]);
      }
    });
  });

  // 刷新按钮 — 已禁用（不再触发数据刷新）

  // 登出按钮
  if (els.logoutBtn) {
    els.logoutBtn.addEventListener('click', async () => {
      try {
        await requestJSON('/api/logout', { method: 'POST' });
        Toast.success('已退出登录');
        Toast.clear();
        resetState();
        resetDashboardState();
        resetDashboardCountUpFlag();
        resetAuditState();
        showShowcaseShell();
        loadShowcase();
      } catch (error) {
        if (error.status === 403 && String(error.message || '').includes('CSRF')) {
          resetState();
          resetDashboardState();
          resetDashboardCountUpFlag();
          resetAuditState();
          showShowcaseShell();
          Toast.warning('登录状态已失效，请重新登录');
          return;
        }
        Toast.error('退出失败: ' + error.message);
      }
    });
  }
}

function bindMediaEvents() {
  // 初始化上传对话框
  initUploadDialog();
  initDedup();
  initMediaViewSwitcher();
  initActivityFilters();

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

      $$('[data-filter]', els.mediaFilters).forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
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
        if (!canManageMedia()) {
          Toast.warning('当前身份无权审核素材');
          return;
        }
        const id = reviewBtn.dataset.id;
        const status = reviewBtn.dataset.mediaReview;
        await reviewMedia(id, status);
      } else if (deleteBtn) {
        if (currentRole() !== 'admin') {
          Toast.warning('当前身份无权删除素材');
          return;
        }
        const id = deleteBtn.dataset.mediaDelete;
        await deleteMedia(id);
      } else if (selectBox) {
        if (!canManageMedia()) return;
        const id = selectBox.dataset.mediaSelect;
        toggleMediaSelection(id);
      } else if (previewBtn) {
        const id = previewBtn.dataset.mediaPreview;
        previewMedia(id);
      } else if (batchBtn) {
        if (!canManageMedia()) {
          Toast.warning('当前身份无权批量审核');
          return;
        }
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

  const url = media.url || media.thumb;
  if (!url) {
    Toast.warning('该素材没有可预览的链接');
    return;
  }

  openMediaPreview(media);
}

function bindReviewEvents() {
  if (els.reviewSearch) {
    els.reviewSearch.addEventListener('input', debounce((e) => {
      state.reviewSearch = e.target.value;
      renderReview();
    }, 300));
  }

  if (els.reviewSort) {
    els.reviewSort.addEventListener('change', (e) => {
      state.reviewSort = e.target.value;
      renderReview();
    });
  }

  if (els.reviewFilters) {
    els.reviewFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-review-filter]');
      if (!btn) return;
      $$('[data-review-filter]', els.reviewFilters).forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
      state.reviewFilter = btn.dataset.reviewFilter;
      renderReview();
    });
  }

  if (els.reviewStack) {
    els.reviewStack.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('[data-media-review]');
      const deleteBtn = e.target.closest('[data-media-delete]');
      const previewBtn = e.target.closest('[data-media-preview]');

      if (reviewBtn) {
        if (!canManageMedia()) {
          Toast.warning('当前身份无权审核素材');
          return;
        }
        const id = reviewBtn.dataset.id;
        const status = reviewBtn.dataset.mediaReview;
        const noteInput = els.reviewStack.querySelector(`[data-review-note-for="${id}"]`);
        const note = noteInput ? noteInput.value : '';
        await reviewMedia(id, status, note);
      } else if (deleteBtn) {
        if (currentRole() !== 'admin') {
          Toast.warning('当前身份无权删除素材');
          return;
        }
        const id = deleteBtn.dataset.mediaDelete;
        await deleteMedia(id);
      } else if (previewBtn) {
        previewMedia(previewBtn.dataset.mediaPreview);
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
      if (!canManageDevices()) {
        Toast.warning('当前身份无权管理设备');
        return;
      }
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

      $$('[data-filter]', els.deviceFilters).forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      state.deviceFilter = btn.dataset.filter;
      syncDeviceView();
    });
  }

  // 设备刷新
  if (els.deviceRefreshBtn) {
    els.deviceRefreshBtn.addEventListener('click', () => {
      refreshDevices({ scope: 'catalog' });
      loadDeviceOptions();
    });
  }

  // 设备图片上传
  if (els.deviceImageBtn && els.deviceImageFile) {
    els.deviceImageBtn.addEventListener('click', () => {
      if (!canManageDevices()) {
        Toast.warning('当前身份无权上传设备图片');
        return;
      }
      els.deviceImageFile.click();
    });
    els.deviceImageFile.addEventListener('change', async () => {
      if (!canManageDevices()) return;
      const file = els.deviceImageFile.files?.[0];
      els.deviceImageFile.value = '';
      if (!file) return;
      try {
        setPending(true);
        const url = await uploadDeviceImage(file);
        setDeviceImagePreview(url);
        Toast.success('设备图片已上传');
      } catch (error) {
        Toast.error(error.message || '设备图片上传失败');
      } finally {
        setPending(false);
      }
    });
  }

  if (els.deviceImageClear) {
    els.deviceImageClear.addEventListener('click', () => {
      if (!canManageDevices()) return;
      setDeviceImagePreview('');
    });
  }

  loadDeviceOptions();

  // 设备操作
  if (els.deviceList) {
    els.deviceList.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-device-edit]');
      const deleteBtn = e.target.closest('[data-device-delete]');

      if (editBtn) {
        if (!canManageDevices()) {
          Toast.warning('当前身份无权编辑设备');
          return;
        }
        const id = editBtn.dataset.deviceEdit;
        startEditDevice(id);
      } else if (deleteBtn) {
        if (!canManageDevices()) {
          Toast.warning('当前身份无权删除设备');
          return;
        }
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
    els.borrowFilters.setAttribute('role', 'group');
    els.borrowFilters.setAttribute('aria-label', '借用申请筛选');
    $$('[data-filter]', els.borrowFilters).forEach(b => {
      b.setAttribute('aria-pressed', String(b.classList.contains('is-active')));
    });
    els.borrowFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      $$('[data-filter]', els.borrowFilters).forEach(b => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
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
      const cancelBtn = e.target.closest('[data-borrow-cancel]');
      const actionBtn = approveBtn || rejectBtn || returnBtn || deleteBtn || cancelBtn;
      if (!actionBtn) return;

      actionBtn.disabled = true;
      actionBtn.setAttribute('aria-busy', 'true');
      try {
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
        } else if (cancelBtn) {
          const id = cancelBtn.dataset.borrowCancel;
          await cancelBorrowRequest(id);
        }
      } finally {
        if (actionBtn.isConnected) {
          actionBtn.disabled = false;
          actionBtn.removeAttribute('aria-busy');
        }
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

      $$('[data-filter]', els.teamFilters).forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
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
      await updateSettings(formData, els.settingsForm);
    });
  }

  const showcaseSettingsForm = document.getElementById('showcase-settings-form');
  if (showcaseSettingsForm) {
    showcaseSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(showcaseSettingsForm);
      await updateSettings(formData, showcaseSettingsForm);
    });
  }

  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = document.querySelector(`.settings-tab[data-tab="${button.dataset.settingsTab}"]`);
      if (tab) tab.click();
    });
  });

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

  // 恢复备份按钮
  const restoreBtn = document.getElementById('restore-backup-btn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', async () => {
      await restoreBackup();
    });
  }
}

// 绑定设置页标签页切换
function bindSettingsTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  const contents = document.querySelectorAll('.settings-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // 切换激活状态与 ARIA
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // 切换内容显示
      contents.forEach(content => {
        if (content.dataset.content === targetTab) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });

      // 初始化对应模块
      if (targetTab === 'users') {
        initUsers();
      } else if (targetTab === 'audit') {
        initAuditLogs();
      } else if (targetTab === 'storage') {
        loadStorageStatus();
      } else if (targetTab === 'preferences') {
        initPreferencesPanel();
      } else if (targetTab === 'maintenance') {
        initMaintenancePanel();
      }
    });
  });
}

// ── 系统管理面板事件 ──
function bindSystemAdminEvents() {
  // 刷新按钮
  const refreshBtn = document.getElementById('sys-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshSystemInfo();
      loadNetworkInfo();
    });
  }

  // 下载数据库备份
  const dbBackupBtn = document.getElementById('sys-db-backup-btn');
  if (dbBackupBtn) {
    dbBackupBtn.addEventListener('click', () => {
      window.open('/api/backup/database', '_blank', 'noopener');
      Toast.success('正在下载数据库备份…');
      flashSuccess(dbBackupBtn);
    });
  }

  // 导出 JSON 备份
  const jsonBackupBtn = document.getElementById('sys-db-json-btn');
  if (jsonBackupBtn) {
    jsonBackupBtn.addEventListener('click', () => {
      window.open('/api/backup', '_blank', 'noopener');
      Toast.success('正在导出 JSON 备份…');
      flashSuccess(jsonBackupBtn);
    });
  }

  // 加载日志
  const loadLogsBtn = document.getElementById('sys-load-logs-btn');
  if (loadLogsBtn) {
    loadLogsBtn.addEventListener('click', () => {
      const dateInput = document.getElementById('sys-log-date');
      loadSystemLogs(dateInput?.value || undefined);
    });
  }

  // 加载全部日志
  const loadAllLogsBtn = document.getElementById('sys-load-all-logs-btn');
  if (loadAllLogsBtn) {
    loadAllLogsBtn.addEventListener('click', () => {
      const dateInput = document.getElementById('sys-log-date');
      loadSystemLogs(dateInput?.value || undefined, 10000);
    });
  }

  // 刷新日志
  const refreshLogsBtn = document.getElementById('sys-refresh-logs-btn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => {
      const dateInput = document.getElementById('sys-log-date');
      loadSystemLogs(dateInput?.value || undefined);
    });
  }

  // 日志搜索按钮
  const searchBtn = document.getElementById('sys-log-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const searchContainer = searchBtn.closest('.sys-card')?.querySelector('.sys-log-search');
      if (searchContainer) {
        searchContainer.hidden = !searchContainer.hidden;
        if (!searchContainer.hidden) {
          const input = document.getElementById('sys-log-search-input');
          if (input) input.focus();
        }
      }
    });
  }

  // 日志搜索输入
  const searchInput = document.getElementById('sys-log-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchLogs(e.target.value);
    });
  }

  // 刷新网络信息
  const refreshNetBtn = document.getElementById('sys-refresh-network-btn');
  if (refreshNetBtn) {
    refreshNetBtn.addEventListener('click', () => loadNetworkInfo());
  }

  // 重启服务
  const restartBtn = document.getElementById('sys-restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => restartService());
  }

  // 飞书同步
  const feishuRunBtn = document.getElementById('sys-feishu-run-btn');
  if (feishuRunBtn) {
    feishuRunBtn.addEventListener('click', () => runFeishuSync());
  }
  const feishuRefreshBtn = document.getElementById('sys-feishu-refresh-btn');
  if (feishuRefreshBtn) {
    feishuRefreshBtn.addEventListener('click', () => loadFeishuSyncStatus());
  }
}

