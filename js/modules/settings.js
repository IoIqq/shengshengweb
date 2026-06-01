/**
 * 系统设置管理模块
 * 负责系统设置的渲染和更新
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { setPending, showFeedback } from '../ui/feedback.js';

/**
 * 渲染系统设置
 */
export function renderSettings() {
  const settings = state.bootstrap?.settings || {};
  if (els.settingsForm) {
    const form = els.settingsForm;
    if (form.siteTitle) form.siteTitle.value = settings.siteTitle || '';
    if (form.siteSubtitle) form.siteSubtitle.value = settings.siteSubtitle || '';
    if (form.homeHeroMessage) form.homeHeroMessage.value = settings.homeHeroMessage || '';
    if (form.publicUrl) form.publicUrl.value = settings.publicUrl || '';
    if (form.adminUsername) form.adminUsername.value = settings.adminUsername || '';
    if (form.adminPassword) form.adminPassword.value = '';
  }

  if (els.systemCard) {
    const sys = state.bootstrap?.system || {};
    const publicUrl = settings.publicUrl || '';
    const hasPublicUrl = publicUrl.trim().length > 0;

    els.systemCard.innerHTML = `
      <div class="system-row"><span>数据库</span><strong>${escapeHtml(sys.databasePath || '-')}</strong></div>
      <div class="system-row"><span>上传目录</span><strong>${escapeHtml(sys.uploadDir || '-')}</strong></div>
      <div class="system-row"><span>自动扫描</span><strong>${escapeHtml(sys.inboxAutoScanSeconds ?? '-')} 秒</strong></div>
      <div class="system-row"><span>上传上限</span><strong>${escapeHtml(sys.maxUploadMb ?? '-')} MB</strong></div>
      <div class="system-row system-row-highlight">
        <span>公开地址</span>
        <div class="system-value-with-action">
          <strong>${hasPublicUrl ? escapeHtml(publicUrl) : '未配置'}</strong>
          ${hasPublicUrl ? `<button class="copy-btn" data-copy-text="${escapeHtml(publicUrl)}" type="button" title="复制地址">📋</button>` : ''}
        </div>
      </div>
    `;
  }
}

/**
 * 更新系统设置
 * @param {FormData} formData - 表单数据
 */
export async function updateSettings(formData) {
  const siteTitle = formData.get('siteTitle')?.trim();
  const siteSubtitle = formData.get('siteSubtitle')?.trim();
  const homeHeroMessage = formData.get('homeHeroMessage')?.trim();
  const publicUrl = formData.get('publicUrl')?.trim();
  const adminUsername = formData.get('adminUsername')?.trim();
  const adminPassword = formData.get('adminPassword')?.trim();

  if (!siteTitle) {
    Toast.warning('请输入站点标题');
    return;
  }

  try {
    setPending(true);
    showFeedback('正在保存设置...', 'info', 'settings');

    const updates = {
      siteTitle,
      siteSubtitle,
      homeHeroMessage,
      publicUrl,
    };

    // 如果提供了管理员账号信息，一起更新
    if (adminUsername) {
      updates.adminUsername = adminUsername;
      if (adminPassword) {
        updates.adminPassword = adminPassword;
      }
    }

    const result = await requestJSON('/api/settings', {
      method: 'PATCH',
      body: updates,
    });

    // 更新本地状态
    if (state.bootstrap?.settings) {
      Object.assign(state.bootstrap.settings, result.settings || updates);
    }

    // 更新页面标题
    if (els.siteTitle) {
      els.siteTitle.textContent = siteTitle;
    }

    // 更新首页消息
    if (els.homeHeroMessage) {
      els.homeHeroMessage.textContent = homeHeroMessage || '这里显示管理员配置的首页说明。';
    }

    Toast.success('设置已保存');
    showFeedback('设置已保存', 'success', 'settings');

    // 清空密码字段
    if (els.settingsForm?.adminPassword) {
      els.settingsForm.adminPassword.value = '';
    }

    renderSettings();
    return result;
  } catch (error) {
    Toast.error(error.message || '保存失败');
    showFeedback(error.message || '保存失败', 'error', 'settings');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      Toast.success('已复制到剪贴板');
    } else {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      Toast.success('已复制到剪贴板');
    }
  } catch (error) {
    Toast.error('复制失败');
    throw error;
  }
}

/**
 * 下载备份
 */
export async function downloadBackup() {
  try {
    Toast.info('正在准备备份文件...');
    window.open('/api/backup', '_blank', 'noopener');
  } catch (error) {
    Toast.error('备份下载失败');
    throw error;
  }
}
