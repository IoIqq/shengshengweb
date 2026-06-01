/**
 * 设备管理模块
 * 负责设备登记的渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { setPending, showFeedback } from '../ui/feedback.js';

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
  const items = Array.isArray(state.deviceItems) ? state.deviceItems : [];
  const stats = getDeviceStats();
  if (els.deviceCount) {
    els.deviceCount.textContent = `${items.length} 台设备 (可借: ${stats.available}, 借出: ${stats.borrowed}, 维护: ${stats.maintenance})`;
  }
  if (!els.deviceList) return;

  els.deviceList.innerHTML = items.length
    ? items
      .map(
        (item) => `
            <article class="device-item" data-status="${escapeHtml(item.status)}">
              <div class="device-head">
                <div>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>${escapeHtml(item.category)} · ${escapeHtml(item.assetNo)}</p>
                </div>
                <span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(deviceStatusLabel(item.status))}</span>
              </div>
              <div class="device-meta">
                <span>位置：${escapeHtml(item.location || '-')}</span>
                <span>责任人：${escapeHtml(item.owner || '-')}</span>
              </div>
              <small class="device-note">${escapeHtml(item.note || '')}</small>
              <div class="device-actions">
                <button class="ghost-btn" data-device-edit="${escapeHtml(item.id)}" type="button">编辑</button>
                <button class="ghost-btn" data-device-delete="${escapeHtml(item.id)}" type="button">删除</button>
              </div>
            </article>
          `,
      )
      .join('')
    : '<div class="empty-state"><strong>没有设备记录</strong><p>点击上方"保存设备"按钮添加第一台设备。</p></div>';
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
 * 创建设备
 * @param {FormData} formData - 表单数据
 */
export async function createDevice(formData) {
  const name = formData.get('name')?.trim();
  const category = formData.get('category')?.trim();
  const assetNo = formData.get('assetNo')?.trim();
  const location = formData.get('location')?.trim() || null;
  const owner = formData.get('owner')?.trim() || null;
  const note = formData.get('note')?.trim() || null;
  const status = formData.get('status') || 'available';

  if (!name || !category || !assetNo) {
    Toast.warning('请填写设备名称、类别和编号');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/devices', {
      method: 'POST',
      body: { name, category, assetNo, location, owner, note, status },
    });

    // 添加到本地状态
    if (state.deviceCatalog) {
      state.deviceCatalog.push(result.device || result);
    }

    Toast.success('设备已添加');
    syncDeviceView();

    // 清空表单
    if (els.deviceForm) els.deviceForm.reset();
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

    // 更新本地状态
    const devices = state.deviceCatalog || [];
    const device = devices.find((d) => d.id === id);
    if (device) {
      Object.assign(device, result.device || updates);
    }

    Toast.success('设备已更新');
    state.deviceEditingId = null;
    syncDeviceView();
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
  if (!confirm('确定要删除这台设备吗？')) {
    return;
  }

  try {
    setPending(true);
    await requestJSON(`/api/devices/${id}`, { method: 'DELETE' });

    // 从本地状态中移除
    if (state.deviceCatalog) {
      state.deviceCatalog = state.deviceCatalog.filter((d) => d.id !== id);
    }

    Toast.success('设备已删除');
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
  state.deviceEditingId = id;
  const device = (state.deviceCatalog || []).find((d) => d.id === id);
  if (!device || !els.deviceForm) return;

  // 填充表单
  const form = els.deviceForm;
  if (form.name) form.name.value = device.name || '';
  if (form.category) form.category.value = device.category || '';
  if (form.assetNo) form.assetNo.value = device.assetNo || '';
  if (form.location) form.location.value = device.location || '';
  if (form.owner) form.owner.value = device.owner || '';
  if (form.note) form.note.value = device.note || '';
  if (form.status) form.status.value = device.status || 'available';

  // 更新表单按钮
  if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存修改';
  if (els.deviceFormId) els.deviceFormId.value = id;
}

/**
 * 取消编辑设备
 */
export function cancelEditDevice() {
  state.deviceEditingId = null;
  if (els.deviceForm) els.deviceForm.reset();
  if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存设备';
  if (els.deviceFormId) els.deviceFormId.value = '';
}
