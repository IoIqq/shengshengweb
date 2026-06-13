/**
 * 设备管理模块
 * 负责设备登记的渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, addLocalActivity } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import { canManageDevices } from '../core/router.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending, showFeedback } from '../ui/feedback.js';

function applyDeviceRoleVisibility() {
  const canManage = canManageDevices();
  if (els.deviceForm) els.deviceForm.hidden = !canManage;
  if (els.deviceFormCancel) els.deviceFormCancel.hidden = !canManage || !state.deviceEditingId;
}

/**
 * 按设备类别推断占位图标
 */
function pickCategoryIcon(category = '') {
  const c = String(category);
  if (/摄|相机|cam/i.test(c)) {
    return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }
  if (/麦|音|mic|sound/i.test(c)) {
    return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  }
  if (/电脑|笔记本|pc|mac|computer/i.test(c)) {
    return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  }
  if (/灯|light/i.test(c)) {
    return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/></svg>';
  }
  if (/三脚|支架|tripod|stand/i.test(c)) {
    return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v6"/><path d="M5 22l7-12 7 12"/><circle cx="12" cy="4" r="2"/></svg>';
  }
  return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
}

/**
 * 获取设备状态标签
 * @param {string} status - 状态
 * @returns {string}
 */
export function deviceStatusLabel(status) {
  if (status === 'borrowed') return '已借出';
  if (status === 'maintenance') return '维护中';
  return '可借';
}

/**
 * 获取设备统计信息
 * @returns {Object}
 */
export function getDeviceStats() {
  const items = Array.isArray(state.deviceItems) ? state.deviceItems : [];
  return {
    total: items.length,
    available: items.filter((item) => item.status === 'available').length,
    borrowed: items.filter((item) => item.status === 'borrowed').length,
    maintenance: items.filter((item) => item.status === 'maintenance').length,
  };
}

/**
 * 检查设备是否匹配视图条件
 * @param {Object} item - 设备对象
 * @returns {boolean}
 */
export function deviceMatchesView(item) {
  const search = String(state.deviceSearch || '').trim().toLowerCase();
  if (state.deviceFilter !== 'all' && item.status !== state.deviceFilter) return false;
  if (!search) return true;
  return [
    item.name,
    item.category,
    item.assetNo,
    item.serialNo,
    item.location,
    item.owner,
    item.note,
    item.status,
  ]
    .join(' ')
    .toLowerCase()
    .includes(search);
}

/**
 * 获取设备源数据
 * @returns {Array}
 */
export function getDeviceSourceItems() {
  return Array.isArray(state.deviceCatalog) ? state.deviceCatalog : [];
}

/**
 * 同步设备视图
 * @returns {Array}
 */
export function syncDeviceView() {
  const items = getDeviceSourceItems().filter((item) => deviceMatchesView(item));
  state.deviceItems = items;
  renderDevices();
  return items;
}

/**
 * 渲染设备列表
 */
export function renderDevices() {
  applyDeviceRoleVisibility();
  const items = Array.isArray(state.deviceItems) ? state.deviceItems : [];
  const stats = getDeviceStats();
  if (els.deviceCount) {
    els.deviceCount.textContent = `${items.length} 台设备 (可借: ${stats.available}, 借出: ${stats.borrowed}, 维护: ${stats.maintenance})`;
  }
  if (!els.deviceList) return;

  els.deviceList.innerHTML = items.length
    ? items
      .map(
        (item) => {
          const hasImage = item.image && item.image.trim();
          const modelInfo = item.model ? ` · ${escapeHtml(item.model)}` : '';
          const purchaseInfo = item.purchaseDate ? ` · 购入 ${escapeHtml(item.purchaseDate)}` : '';
          const serialInfo = item.serialNo ? ` · SN ${escapeHtml(item.serialNo)}` : '';
          const priceVal = Number(item.price || 0);
          const priceInfo = priceVal > 0 ? `<span>采购价：¥${escapeHtml(priceVal.toFixed(2))}</span>` : '';
          const warrantyInfo = item.warrantyUntil ? `<span>保修至：${escapeHtml(item.warrantyUntil)}</span>` : '';
          const noteHtml = item.note
            ? `<details class="device-note-details"><summary>备注</summary><p>${escapeHtml(item.note)}</p></details>`
            : '';
          const actionsHtml = canManageDevices()
            ? `<div class="device-actions">
                    <button class="ghost-btn" data-device-edit="${escapeHtml(item.id)}" type="button">编辑</button>
                    <button class="ghost-btn" data-device-delete="${escapeHtml(item.id)}" type="button">删除</button>
                  </div>`
            : '';
          return `
            <article class="device-item" data-status="${escapeHtml(item.status)}">
              <div class="device-card-layout">
                <div class="device-thumb" data-status-ring="${escapeHtml(item.status)}">
                  ${hasImage
                    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
                    : `<span class="device-thumb-icon" data-category="${escapeHtml(item.category || '')}">${pickCategoryIcon(item.category)}</span>`
                  }
                </div>
                <div class="device-info">
                  <div class="device-head">
                    <div>
                      <h3>${escapeHtml(item.name)}</h3>
                      <p>${escapeHtml(item.category)} · ${escapeHtml(item.assetNo)}${modelInfo}${serialInfo}${purchaseInfo}</p>
                    </div>
                    <span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(deviceStatusLabel(item.status))}</span>
                  </div>
                  <div class="device-meta">
                    <span>位置：${escapeHtml(item.location || '-')}</span>
                    <span>责任人：${escapeHtml(item.owner || '-')}</span>
                    ${priceInfo}
                    ${warrantyInfo}
                  </div>
                  ${noteHtml}
                  ${actionsHtml}
                </div>
              </div>
            </article>
          `;
        },
      )
      .join('')
    : `<div class="empty-state"><strong>没有设备记录</strong><p>${canManageDevices() ? '点击上方"保存设备"按钮添加第一台设备。' : '暂无可查看的设备台账。'}</p></div>`;
}

/**
 * 构建设备查询参数
 * @returns {string}
 */
export function buildDeviceQuery() {
  const params = new URLSearchParams();
  const search = String(state.deviceSearch || '').trim();
  if (search) params.set('search', search);
  if (state.deviceFilter && state.deviceFilter !== 'all') params.set('status', state.deviceFilter);
  return params.toString();
}

/**
 * 刷新设备列表
 * @param {Object} options - 选项
 * @returns {Promise<Array>}
 */
export async function refreshDevices({ scope = 'view', silent = false } = {}) {
  if (!state.session?.authenticated) return [];

  try {
    const endpoint =
      scope === 'catalog'
        ? '/api/devices'
        : (() => {
          const query = buildDeviceQuery();
          return query ? `/api/devices?${query}` : '/api/devices';
        })();

    const result = await requestJSON(endpoint);
    const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];

    if (scope === 'catalog') {
      state.deviceCatalog = items;
      return syncDeviceView();
    }
    state.deviceItems = items;
    renderDevices();
    return items;
  } catch (error) {
    if (!silent) {
      Toast.error(error.message || '刷新设备列表失败');
    }
    throw error;
  }
}

/**
 * 加载 datalist 推荐项（类别 / 位置 / 责任人）
 */
export async function loadDeviceOptions() {
  if (!state.session?.authenticated) return;
  try {
    const result = await requestJSON('/api/devices/options');
    const fillList = (el, values) => {
      if (!el || !Array.isArray(values)) return;
      el.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
    };
    fillList(els.deviceCatList, result.categories);
    fillList(els.deviceLocList, result.locations);
    fillList(els.deviceOwnerList, result.owners);
  } catch (error) {
    // 静默失败，datalist 只是辅助
  }
}

/**
 * 上传设备图片（仿 media XHR 模式以支持进度）
 * @param {File} file
 * @returns {Promise<string>} imageUrl
 */
export async function uploadDeviceImage(file) {
  if (!file) return '';
  const id = state.deviceEditingId || 'new';
  const csrfToken = readCookie('ss_csrf');
  const formData = new FormData();
  formData.append('image', file);

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/devices/${encodeURIComponent(id)}/image`);
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data.imageUrl || '');
        } else {
          reject(new Error(data.error || `上传失败 (${xhr.status})`));
        }
      } catch (e) {
        reject(new Error('解析服务器响应失败'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
    xhr.send(formData);
  });
}

/**
 * 设置设备图片预览
 */
export function setDeviceImagePreview(url) {
  if (els.deviceImageUrl) els.deviceImageUrl.value = url || '';
  if (els.deviceImagePreview) {
    if (url) {
      els.deviceImagePreview.src = url;
      els.deviceImagePreview.hidden = false;
    } else {
      els.deviceImagePreview.removeAttribute('src');
      els.deviceImagePreview.hidden = true;
    }
  }
  if (els.deviceImageClear) els.deviceImageClear.hidden = !url;
  const wrap = els.deviceImagePreview?.parentElement;
  if (wrap) {
    const empty = wrap.querySelector('.device-image-empty');
    if (empty) empty.hidden = !!url;
  }
}

/**
 * 创建设备
 * @param {FormData} formData - 表单数据
 */
export async function createDevice(formData) {
  const name = formData.get('name')?.trim();
  const category = formData.get('category')?.trim();
  const assetNo = formData.get('assetNo')?.trim();
  const model = formData.get('model')?.trim() || null;
  const purchaseDate = formData.get('purchaseDate')?.trim() || null;
  const warrantyUntil = formData.get('warrantyUntil')?.trim() || null;
  const serialNo = formData.get('serialNo')?.trim() || null;
  const priceRaw = formData.get('price');
  const price = priceRaw === '' || priceRaw === null ? 0 : Number(priceRaw);
  const image = formData.get('image')?.trim() || null;
  const location = formData.get('location')?.trim() || null;
  const owner = formData.get('owner')?.trim() || null;
  const note = formData.get('note')?.trim() || null;
  const status = formData.get('status') || 'available';

  if (!name || !category || !assetNo) {
    Toast.warning('请填写设备名称、类别和编号');
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    Toast.warning('采购价格需为非负数字');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/devices', {
      method: 'POST',
      body: { name, category, assetNo, model, purchaseDate, warrantyUntil, serialNo, price, image, location, owner, note, status },
    });

    const newItem = result.item || result.device || result;
    if (state.deviceCatalog) {
      state.deviceCatalog.push(newItem);
    }

    Toast.success('设备已添加');
    addLocalActivity('设备登记', `新增设备 ${name}（${assetNo}）`);
    syncDeviceView();
    loadDeviceOptions();

    if (els.deviceForm) els.deviceForm.reset();
    setDeviceImagePreview('');
    state.deviceEditingId = null;
  } catch (error) {
    Toast.error(error.message || '添加失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 更新设备
 * @param {string} id - 设备 ID
 * @param {Object} updates - 更新数据
 */
export async function updateDevice(id, updates) {
  try {
    setPending(true);
    const result = await requestJSON(`/api/devices/${id}`, {
      method: 'PATCH',
      body: updates,
    });

    const devices = state.deviceCatalog || [];
    const device = devices.find((d) => d.id === id);
    const updated = result.item || result.device || updates;
    if (device) {
      Object.assign(device, updated);
    }

    Toast.success('设备已更新');
    addLocalActivity('设备更新', `${updated.name || updates.name || '设备'} 信息已更新`);
    state.deviceEditingId = null;
    syncDeviceView();
    loadDeviceOptions();
    return result;
  } catch (error) {
    Toast.error(error.message || '更新失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 删除设备
 * @param {string} id - 设备 ID
 */
export async function deleteDevice(id) {
  const confirmed = await Dialog.confirm({
    title: '删除设备',
    message: '确定要删除这台设备吗？此操作不可恢复。',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    setPending(true);
    await requestJSON(`/api/devices/${id}`, { method: 'DELETE' });

    if (state.deviceCatalog) {
      state.deviceCatalog = state.deviceCatalog.filter((d) => d.id !== id);
    }

    Toast.success('设备已删除');
    addLocalActivity('设备删除', '删除了一条设备记录');
    syncDeviceView();
  } catch (error) {
    Toast.error(error.message || '删除失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 开始编辑设备
 * @param {string} id - 设备 ID
 */
export function startEditDevice(id) {
  if (!canManageDevices()) return;
  state.deviceEditingId = id;
  const device = (state.deviceCatalog || []).find((d) => d.id === id);
  if (!device || !els.deviceForm) return;

  const form = els.deviceForm;
  if (form.name) form.name.value = device.name || '';
  if (form.category) form.category.value = device.category || '';
  if (form.assetNo) form.assetNo.value = device.assetNo || '';
  if (form.serialNo) form.serialNo.value = device.serialNo || '';
  if (form.model) form.model.value = device.model || '';
  if (form.purchaseDate) form.purchaseDate.value = device.purchaseDate || '';
  if (form.warrantyUntil) form.warrantyUntil.value = device.warrantyUntil || '';
  if (form.price) form.price.value = device.price ? Number(device.price) : '';
  if (form.location) form.location.value = device.location || '';
  if (form.owner) form.owner.value = device.owner || '';
  if (form.note) form.note.value = device.note || '';
  if (form.status) form.status.value = device.status || 'available';

  setDeviceImagePreview(device.image || '');

  if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存修改';
  if (els.deviceFormId) els.deviceFormId.value = id;
  applyDeviceRoleVisibility();
}

/**
 * 取消编辑设备
 */
export function cancelEditDevice() {
  state.deviceEditingId = null;
  if (els.deviceForm) els.deviceForm.reset();
  setDeviceImagePreview('');
  if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存设备';
  if (els.deviceFormId) els.deviceFormId.value = '';
  applyDeviceRoleVisibility();
}
