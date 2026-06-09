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
  }

  const showcaseForm = document.getElementById('showcase-settings-form');
  if (showcaseForm) {
    const showcase = settings.showcase || {};
    if (showcaseForm.showcaseEnabled) showcaseForm.showcaseEnabled.value = showcase.enabled === false ? '0' : '1';
    if (showcaseForm.showcaseBrand) showcaseForm.showcaseBrand.value = showcase.brand || '';
    if (showcaseForm.showcaseHeroLabel) showcaseForm.showcaseHeroLabel.value = showcase.heroLabel || '';
    if (showcaseForm.showcaseTitle) showcaseForm.showcaseTitle.value = showcase.title || '';
    if (showcaseForm.showcaseSubtitle) showcaseForm.showcaseSubtitle.value = showcase.subtitle || '';
    if (showcaseForm.showcaseLimit) showcaseForm.showcaseLimit.value = showcase.limit || 50;
    if (showcaseForm.showcaseKindFilter) showcaseForm.showcaseKindFilter.value = showcase.kindFilter || 'all';
    if (showcaseForm.showcaseFooterText) showcaseForm.showcaseFooterText.value = showcase.footerText || '';
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
          ${hasPublicUrl ? `<button class="copy-btn" data-copy-text="${escapeHtml(publicUrl)}" type="button" title="复制地址"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
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

  const isShowcaseForm = formData.has('showcaseTitle') || formData.has('showcaseEnabled');

  if (!isShowcaseForm && !siteTitle) {
    Toast.warning('请输入站点标题');
    return;
  }

  try {
    setPending(true);
    showFeedback('正在保存设置...', 'info', 'settings');

    const updates = isShowcaseForm
      ? {
        showcaseEnabled: formData.get('showcaseEnabled') === '1',
        showcaseBrand: formData.get('showcaseBrand')?.trim(),
        showcaseHeroLabel: formData.get('showcaseHeroLabel')?.trim(),
        showcaseTitle: formData.get('showcaseTitle')?.trim(),
        showcaseSubtitle: formData.get('showcaseSubtitle')?.trim(),
        showcaseLimit: formData.get('showcaseLimit'),
        showcaseKindFilter: formData.get('showcaseKindFilter'),
        showcaseFooterText: formData.get('showcaseFooterText')?.trim(),
      }
      : {
        siteTitle,
        siteSubtitle,
        homeHeroMessage,
        publicUrl,
      };

    const result = await requestJSON('/api/settings', {
      method: 'PATCH',
      body: updates,
    });

    // 更新本地状态
    if (state.bootstrap?.settings) {
      Object.assign(state.bootstrap.settings, result.settings || updates);
    }

    // 更新页面标题
    if (!isShowcaseForm && els.siteTitle) {
      els.siteTitle.textContent = siteTitle;
    }

    // 更新首页消息
    if (!isShowcaseForm && els.homeHeroMessage) {
      els.homeHeroMessage.textContent = homeHeroMessage || '这里显示管理员配置的首页说明。';
    }

    Toast.success('设置已保存');
    showFeedback('设置已保存', 'success', 'settings');

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
