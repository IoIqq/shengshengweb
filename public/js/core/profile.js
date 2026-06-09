/**
 * 个人资料面板
 *
 * 负责账户弹窗的资料展示、编辑、改密、头像上传，以及顶栏用户信息显示。
 */

import { state } from './state.js';
import { els } from './dom.js';
import { getInitials } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import {
  setPending,
  openProfilePopover,
  closeProfilePopover,
  setProfileFeedback,
  setProfilePwdHint,
} from '../ui/feedback.js';
import { roleLabel, roleWorkspaceLabel } from './router.js';

// 个人资料事件绑定
export function bindProfileEvents() {
  // 打开个人资料弹窗
  if (els.userAvatarBtn) {
    els.userAvatarBtn.addEventListener('click', () => {
      openProfilePopover();
      syncProfileUI();
      loadProfileSummary();
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

async function loadProfileSummary() {
  try {
    const result = await requestJSON('/api/profile/summary');
    const summary = result.summary || result;
    if (els.profileSummaryTodos) els.profileSummaryTodos.textContent = summary.todayTodos ?? 0;
    if (els.profileSummaryBorrow) els.profileSummaryBorrow.textContent = summary.borrowedDevices ?? 0;
    if (els.profileSummaryActive) els.profileSummaryActive.textContent = summary.weekActiveScore ?? 0;
  } catch (error) {
    if (els.profileSummaryTodos) els.profileSummaryTodos.textContent = '0';
    if (els.profileSummaryBorrow) els.profileSummaryBorrow.textContent = '0';
    if (els.profileSummaryActive) els.profileSummaryActive.textContent = '0';
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
  }
  const profilePhone = document.getElementById('profile-phone');
  if (profilePhone) profilePhone.value = user.phone || '';
  const profileBio = document.getElementById('profile-bio');
  if (profileBio) profileBio.value = user.bio || '';
  // 角色徽章
  const roleBadge = document.getElementById('profile-role-badge');
  if (roleBadge) {
    const roleLabels = { admin: '管理员', editor: '编辑者', guest: '访客' };
    roleBadge.textContent = roleLabels[user.role] || '成员';
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
    await requestJSON('/api/profile', {
      method: 'PATCH',
      body: { displayName, signature, phone, bio }
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

    const csrfToken = readCookie('ss_csrf');
    const response = await fetch('/api/profile/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
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
}
