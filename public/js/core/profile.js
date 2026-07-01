/**
 * 个人资料面板
 *
 * 负责账户弹窗的资料展示、编辑、改密、头像上传，以及顶栏用户信息显示。
 *
 * 本次迭代加强：
 *   - ESC 关闭、文档级点击外部关闭、Tab 焦点循环（focus trap）
 *   - 头像上传前端校验（size + MIME）+ 即时本地预览 + 转圈遮罩
 *   - 资料/改密两个独立 form 监听 submit，避免 Enter 误触发
 *   - 字符计数（签名 / 简介）
 *   - 导航模式 select 真正生效（applyNavMode + 持久化）
 *   - 保存/改密按钮 is-loading 状态可视化
 */

import { state } from './state.js';
import { els } from './dom.js';
import { getInitials } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import {
  setPending,
  openProfilePopover,
  closeProfilePopover,
  isProfileOpen,
  setProfileFeedback,
  setProfilePwdHint,
} from '../ui/feedback.js';
import { applyNavMode } from '../ui/navigation.js';
import { roleLabel, roleWorkspaceLabel } from './router.js';

// 头像上传约束
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const AVATAR_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// 字符上限（与后端 validators 保持一致或更宽松；超出由后端兜底）
const SIGNATURE_MAX = 60;
const BIO_MAX = 200;

// 防止重复绑定 document 级监听器
let docHandlersBound = false;

// 个人资料事件绑定
export function bindProfileEvents() {
  // 打开个人资料弹窗
  if (els.userAvatarBtn) {
    els.userAvatarBtn.addEventListener('click', () => {
      openProfilePopover();
      syncProfileUI();
      loadProfileSummary();
      loadSessions();
    });
  }

  // 关闭按钮
  if (els.profileClose) {
    els.profileClose.addEventListener('click', () => {
      closeProfilePopover();
    });
  }

  // 资料表单（独立 form：#profile-info-form）— submit 走保存
  const infoForm = document.getElementById('profile-info-form');
  if (infoForm) {
    infoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveProfile();
    });
  }
  // 兼容现有 button[onclick=null] 的"保存按钮"路径
  if (els.profileSaveBtn) {
    els.profileSaveBtn.addEventListener('click', async (e) => {
      // 若按钮在 form 内会自动触发 submit；这里是兜底（保留向后兼容）
      if (els.profileSaveBtn.form) return;
      e.preventDefault();
      await saveProfile();
    });
  }

  // 改密表单（独立 form：#profile-pwd-form）
  const pwdForm = document.getElementById('profile-pwd-form');
  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await changePassword();
    });
  }
  if (els.profilePwdBtn) {
    els.profilePwdBtn.addEventListener('click', async (e) => {
      if (els.profilePwdBtn.form) return;
      e.preventDefault();
      await changePassword();
    });
  }

  // 头像上传
  if (els.profileAvatarInput) {
    let avatarUploading = false;
    els.profileAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // 上传中忽略新的 change，避免并发上传互相覆盖预览
      if (avatarUploading) {
        e.target.value = '';
        return;
      }
      // 上传前校验
      const err = validateAvatarFile(file);
      if (err) {
        setProfileFeedback(err, 'error');
        e.target.value = '';
        return;
      }
      avatarUploading = true;
      els.profileAvatarInput.disabled = true;
      try {
        await uploadAvatar(file);
      } finally {
        avatarUploading = false;
        els.profileAvatarInput.disabled = false;
        // 上传完成无论成功失败都清 input.value，方便用户重选同名文件
        e.target.value = '';
      }
    });
  }

  // 删除头像
  const avatarDeleteBtn = document.getElementById('profile-avatar-delete-btn');
  if (avatarDeleteBtn) {
    avatarDeleteBtn.addEventListener('click', async () => {
      if (!confirm('确定要删除当前头像吗？')) return;
      await deleteAvatar();
    });
  }

  // 退出其他所有设备
  const logoutOthersBtn = document.getElementById('profile-logout-others-btn');
  if (logoutOthersBtn) {
    logoutOthersBtn.addEventListener('click', async () => {
      if (!confirm('将退出除当前设备外的所有登录会话，确定继续？')) return;
      await logoutOtherSessions();
    });
  }

  // 导航模式 select 真正生效 + 持久化
  if (els.profileNavMode) {
    els.profileNavMode.addEventListener('change', async (e) => {
      const mode = e.target.value === 'locked' ? 'locked' : 'auto';
      applyNavMode(mode);
      // 持久化（PATCH 失败也保留前端切换体验）
      try {
        await requestJSON('/api/profile', {
          method: 'PATCH',
          body: { navMode: mode },
        });
        if (state.session?.user) state.session.user.navMode = mode;
        if (state.profile) state.profile.navMode = mode;
        setProfileFeedback(`导航模式已切换为 ${mode === 'locked' ? '锁定' : '自动'}`, 'success');
      } catch (error) {
        // 后端如未支持该字段则静默；UI 已切换
        console.warn('navMode 未持久化：', error?.message);
      }
    });
  }

  // 字符计数
  bindCharCounter('profile-signature', 'profile-signature-counter', SIGNATURE_MAX);
  bindCharCounter('profile-bio', 'profile-bio-counter', BIO_MAX);

  // 文档级 ESC + 点击外部关闭 + focus trap（只绑一次）
  if (!docHandlersBound) {
    docHandlersBound = true;

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (!isProfileOpen()) return;
      e.preventDefault();
      closeProfilePopover();
    });

    // 点击外部关闭：用 mousedown 而不是 click，避免下拉/上传 input 等异步触发的误判
    document.addEventListener('mousedown', (e) => {
      if (!isProfileOpen()) return;
      const inner = els.profilePopover?.querySelector('.profile-popover-inner');
      if (!inner) return;
      // 点击落在内容内、或落在打开按钮（用户头像）上 → 不关
      if (inner.contains(e.target)) return;
      if (els.userAvatarBtn && els.userAvatarBtn.contains(e.target)) return;
      closeProfilePopover();
    });

    // Focus trap：Tab/Shift+Tab 在 popover 内循环
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (!isProfileOpen()) return;
      const inner = els.profilePopover?.querySelector('.profile-popover-inner');
      if (!inner) return;
      const focusables = getFocusables(inner);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !inner.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
}

/**
 * 获取容器内可聚焦元素（用于 focus trap）
 */
function getFocusables(root) {
  const sel = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll(sel)).filter(el => {
    return el.offsetParent !== null && !el.hasAttribute('inert');
  });
}

/**
 * 字符计数绑定：input 实时更新，溢出时给计数器加 is-over
 */
function bindCharCounter(inputId, counterId, max) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;
  const update = () => {
    const len = input.value.length;
    counter.textContent = `${len}/${max}`;
    counter.classList.toggle('is-over', len > max);
  };
  input.addEventListener('input', update);
  update();
}

/**
 * 头像文件校验
 * @returns {string|null} 错误信息（null 表示通过）
 */
function validateAvatarFile(file) {
  if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
    return '仅支持 PNG / JPG / WEBP / GIF 格式';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return `图片不能超过 ${(AVATAR_MAX_BYTES / 1024 / 1024).toFixed(0)}MB`;
  }
  return null;
}

async function loadProfileSummary() {
  const summaryCards = document.querySelectorAll('.profile-summary-card');
  // 加载期间显示骨架态
  summaryCards.forEach((card) => card.classList.add('is-loading'));

  try {
    const result = await requestJSON('/api/profile/summary');
    const summary = result.summary || result;
    if (els.profileSummaryTodos) els.profileSummaryTodos.textContent = summary.todayTodos ?? 0;
    if (els.profileSummaryBorrow)
      els.profileSummaryBorrow.textContent = summary.borrowedDevices ?? 0;
    if (els.profileSummaryActive)
      els.profileSummaryActive.textContent = summary.weekActiveScore ?? 0;
  } catch (error) {
    // 错误时回退占位符，避免误导显示 0
    if (els.profileSummaryTodos) els.profileSummaryTodos.textContent = '--';
    if (els.profileSummaryBorrow) els.profileSummaryBorrow.textContent = '--';
    if (els.profileSummaryActive) els.profileSummaryActive.textContent = '--';
  } finally {
    summaryCards.forEach((card) => card.classList.remove('is-loading'));
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
    els.profileAccountRole.textContent = roleLabel(user.role);
  }

  // 填充表单
  if (els.profileDisplayName) {
    els.profileDisplayName.value = user.displayName || '';
  }
  if (els.profileSignature) {
    els.profileSignature.value = user.signature || '';
    els.profileSignature.dispatchEvent(new Event('input'));
  }
  if (els.profileNavMode) {
    els.profileNavMode.value = user.navMode === 'locked' ? 'locked' : 'auto';
  }
  const profilePhone = document.getElementById('profile-phone');
  if (profilePhone) profilePhone.value = user.phone || '';
  const profileBio = document.getElementById('profile-bio');
  if (profileBio) {
    profileBio.value = user.bio || '';
    profileBio.dispatchEvent(new Event('input'));
  }
  // 角色徽章
  const roleBadge = document.getElementById('profile-role-badge');
  if (roleBadge) {
    const roleLabels = { admin: '管理员', editor: '编辑者', guest: '访客' };
    roleBadge.textContent = roleLabels[user.role] || '成员';
  }

  // 删除头像按钮：仅当存在头像时显示
  const avatarDeleteBtn = document.getElementById('profile-avatar-delete-btn');
  if (avatarDeleteBtn) {
    avatarDeleteBtn.hidden = !user.avatarUrl;
  }

  // 状态点：根据 user.online 切三态；后端无字段则隐藏
  const dot = document.getElementById('profile-status-dot');
  if (dot) {
    if (typeof user.online === 'string') {
      dot.dataset.status = user.online; // 'online' | 'away' | 'offline'
      dot.hidden = false;
    } else if (typeof user.online === 'boolean') {
      dot.dataset.status = user.online ? 'online' : 'offline';
      dot.hidden = false;
    } else {
      // 未知 → 维持 CSS 默认，但去掉 data-status，避免误显示绿色
      delete dot.dataset.status;
    }
  }
}

// 保存个人资料
async function saveProfile() {
  const displayName = els.profileDisplayName?.value?.trim();
  const signature = els.profileSignature?.value?.trim();
  const phone = document.getElementById('profile-phone')?.value?.trim();
  const bio = document.getElementById('profile-bio')?.value?.trim();

  try {
    setPending(true);
    setButtonLoading(els.profileSaveBtn, true);
    await requestJSON('/api/profile', {
      method: 'PATCH',
      body: { displayName, signature, phone, bio },
    });

    // 更新本地状态
    if (state.session?.user) {
      state.session.user.displayName = displayName;
      state.session.user.signature = signature;
      state.session.user.phone = phone;
      state.session.user.bio = bio;
    }

    setProfileFeedback('资料已保存', 'success');
    updateUserDisplay();
    syncProfileUI();
  } catch (error) {
    setProfileFeedback(error.message || '保存失败', 'error');
  } finally {
    setPending(false);
    setButtonLoading(els.profileSaveBtn, false);
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

  if (newPassword.length < 8) {
    setProfilePwdHint('新密码至少 8 个字符', 'error');
    return;
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    setProfilePwdHint('密码需包含大写字母、小写字母和数字', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setProfilePwdHint('两次输入的新密码不一致', 'error');
    return;
  }

  try {
    setPending(true);
    setButtonLoading(els.profilePwdBtn, true);
    await requestJSON('/api/profile/password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    });

    // 清空密码字段
    if (els.profilePwdOld) els.profilePwdOld.value = '';
    if (els.profilePwdNew) els.profilePwdNew.value = '';
    if (els.profilePwdConfirm) els.profilePwdConfirm.value = '';

    setProfilePwdHint('');
    setProfileFeedback('密码已修改，其他设备已退出', 'success');
    loadSessions();
  } catch (error) {
    setProfilePwdHint(error.message || '修改失败', 'error');
  } finally {
    setPending(false);
    setButtonLoading(els.profilePwdBtn, false);
  }
}

// 上传头像
async function uploadAvatar(file) {
  const avatarLarge = document.querySelector('.profile-avatar-large');
  const previewImg = els.profileAvatarImage;
  const previewInitials = document.getElementById('profile-avatar-initials');

  // 用 createObjectURL 即时预览（独立于服务器响应）
  let objectUrl = null;
  try {
    objectUrl = URL.createObjectURL(file);
    if (previewImg) {
      previewImg.src = objectUrl;
      previewImg.hidden = false;
      if (previewInitials) previewInitials.style.opacity = '0';
    }
  } catch (_) {
    /* 浏览器不支持时跳过预览，不阻塞上传 */
  }

  // 显示上传遮罩
  avatarLarge?.classList.add('is-uploading');

  try {
    setProfileFeedback('正在上传头像…', 'success');

    const formData = new FormData();
    formData.append('avatar', file);

    const csrfToken = readCookie('ss_csrf');
    const response = await fetch('/api/profile/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '上传失败');

    // 用服务器返回的 URL 替换临时预览（释放 objectURL）
    if (state.session?.user) {
      state.session.user.avatarUrl = data.avatarUrl;
    }
    if (previewImg && data.avatarUrl) {
      previewImg.src = data.avatarUrl;
    }

    setProfileFeedback('头像已更新', 'success');
    updateUserDisplay();
    syncProfileUI();
  } catch (error) {
    // 失败时回滚预览到 initials
    if (previewImg) {
      previewImg.removeAttribute('src');
      previewImg.hidden = true;
      if (previewInitials) previewInitials.style.opacity = '';
    }
    setProfileFeedback(error.message || '上传失败', 'error');
  } finally {
    avatarLarge?.classList.remove('is-uploading');
    if (objectUrl) {
      // 延迟一点释放，避免预览闪烁
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }
}

/**
 * 加载并渲染当前用户的有效会话列表
 */
async function loadSessions() {
  const list = document.getElementById('profile-sessions-list');
  const logoutOthersBtn = document.getElementById('profile-logout-others-btn');
  if (!list) return;

  list.innerHTML = '<p class="profile-sessions-empty">加载中…</p>';
  if (logoutOthersBtn) logoutOthersBtn.hidden = true;

  try {
    const { sessions = [] } = await requestJSON('/api/profile/sessions');
    if (sessions.length === 0) {
      list.innerHTML = '<p class="profile-sessions-empty">暂无在线设备</p>';
      return;
    }
    list.innerHTML = sessions.map(renderSessionItem).join('');
    const hasOthers = sessions.some((s) => !s.isCurrent);
    if (logoutOthersBtn) logoutOthersBtn.hidden = !hasOthers;
  } catch (error) {
    list.innerHTML = `<p class="profile-sessions-empty">获取失败：${error.message || ''}</p>`;
  }
}

/**
 * 解析 user-agent 为简短的设备/浏览器描述
 */
function parseUserAgent(ua) {
  if (!ua) return '未知设备';
  let browser = '浏览器';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = '未知系统';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} · ${os}`;
}

function renderSessionItem(s) {
  const created = s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '—';
  const device = parseUserAgent(s.userAgent);
  const ip = s.ipAddress || '—';
  const badge = s.isCurrent
    ? '<span class="session-badge session-badge-current">当前设备</span>'
    : '';
  return `
    <div class="session-item${s.isCurrent ? ' is-current' : ''}">
      <div class="session-item-main">
        <span class="session-device">${device}</span>
        <span class="session-meta">${ip} · ${created}</span>
      </div>
      ${badge}
    </div>`;
}

/**
 * 退出其他所有设备
 */
async function logoutOtherSessions() {
  const btn = document.getElementById('profile-logout-others-btn');
  try {
    setPending(true);
    setButtonLoading(btn, true);
    await requestJSON('/api/profile/sessions/others', { method: 'DELETE' });
    setProfileFeedback('已退出其他所有设备', 'success');
    await loadSessions();
  } catch (error) {
    setProfileFeedback(error.message || '操作失败', 'error');
  } finally {
    setPending(false);
    setButtonLoading(btn, false);
  }
}

/**
 * 删除头像
 */
async function deleteAvatar() {
  try {
    setPending(true);
    const csrfToken = readCookie('ss_csrf');
    const response = await fetch('/api/profile/avatar', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '删除失败');

    const previewImg = els.profileAvatarImage;
    const previewInitials = document.getElementById('profile-avatar-initials');
    if (previewImg) {
      previewImg.removeAttribute('src');
      previewImg.hidden = true;
    }
    if (previewInitials) previewInitials.style.opacity = '';
    if (state.session?.user) state.session.user.avatarUrl = '';
    const avatarDeleteBtn = document.getElementById('profile-avatar-delete-btn');
    if (avatarDeleteBtn) avatarDeleteBtn.hidden = true;

    setProfileFeedback('头像已删除', 'success');
    updateUserDisplay();
    syncProfileUI();
  } catch (error) {
    setProfileFeedback(error.message || '删除头像失败', 'error');
  } finally {
    setPending(false);
  }
}

/**
 * 给按钮加 loading 视觉状态（CSS 由 .is-loading 接管 spinner）
 */
function setButtonLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', !!on);
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
}

/**
 * 更新顶栏用户信息显示（头像首字母、角色、欢迎语）
 */
export function updateUserDisplay() {
  const user = state.session?.user;
  if (!user) return;

  if (els.userAvatarInitials) {
    els.userAvatarInitials.textContent = getInitials(user.displayName || user.username);
  }

  if (els.rolePill) {
    els.rolePill.textContent = roleWorkspaceLabel(user.role);
  }

  if (els.roleTitle) {
    els.roleTitle.textContent = user.displayName ? `欢迎回来，${user.displayName}` : '欢迎回来';
  }

  // 顶栏头像图与首字母占位互斥渲染：有 avatarUrl 显示图、隐藏首字母；
  // 无（删除头像 / 切换账号）则反之。同时清理旧 src，避免老图残留。
  const hasAvatar = Boolean(user.avatarUrl);
  if (els.userAvatarImage) {
    if (hasAvatar) {
      els.userAvatarImage.src = user.avatarUrl;
      els.userAvatarImage.hidden = false;
    } else {
      els.userAvatarImage.removeAttribute('src');
      els.userAvatarImage.hidden = true;
    }
  }
  if (els.userAvatarInitials) {
    els.userAvatarInitials.hidden = hasAvatar;
  }
}
