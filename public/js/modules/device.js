/**
 * 设备管理模块
 * 负责设备登记的渲染和 CRUD 操作
 *
 * 台账优先布局：密集表格置顶，登记表单收进右侧抽屉（#device-drawer，body 层），
 * 统计芯片兼做筛选，行内状态 chip 弹小菜单快改。
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, addLocalActivity } from '../utils/helpers.js';
import { requestJSON, readCookie } from '../utils/api.js';
import { canManageDevices } from '../core/router.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending } from '../ui/feedback.js';

const STATUS_OPTIONS = [
  { value: 'available', label: '可借' },
  { value: 'borrowed', label: '已借出' },
  { value: 'maintenance', label: '维护中' },
];

// 行内状态弹层当前目标 { id, triggerEl }
let _statusPopoverTarget = null;

function applyDeviceRoleVisibility() {
  const canManage = canManageDevices();
  // 管理者才显示「新增设备」；表单本身在抽屉里，随抽屉开合
  if (els.deviceAddBtn) els.deviceAddBtn.hidden = !canManage;
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
 * 获取设备统计信息（基于当前可见视图）
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
 * 全量台账统计（用于统计芯片计数，不受当前筛选/搜索影响）
 */
function getDeviceCatalogStats() {
  const items = Array.isArray(state.deviceCatalog) ? state.deviceCatalog : [];
  return {
    total: items.length,
    available: items.filter((i) => i.status === 'available').length,
    borrowed: items.filter((i) => i.status === 'borrowed').length,
    maintenance: items.filter((i) => i.status === 'maintenance').length,
  };
}

/**
 * 检查设备是否匹配视图条件
 * @param {Object} item - 设备对象
 * @returns {boolean}
 */
export function deviceMatchesView(item) {
  const search = String(state.deviceSearch || '').trim().toLowerCase();
  if (state.deviceFilter && state.deviceFilter !== 'all' && item.status !== state.deviceFilter) return false;
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
 * 渲染统计-筛选芯片到 #device-filters
 * 点「借出 N」即筛借出，复用既有 [data-filter] 委托（events.js）
 */
function renderDeviceStatFilters() {
  if (!els.deviceFilters) return;
  const stats = getDeviceCatalogStats();
  const current = state.deviceFilter || 'all';
  const chips = [
    { filter: 'all', label: '全部', count: stats.total, tone: '' },
    { filter: 'available', label: '可借', count: stats.available, tone: 'available' },
    { filter: 'borrowed', label: '借出', count: stats.borrowed, tone: 'borrowed' },
    { filter: 'maintenance', label: '维护', count: stats.maintenance, tone: 'maintenance' },
  ];
  els.deviceFilters.innerHTML = chips
    .map((f) => {
      const active = current === f.filter ? ' is-active' : '';
      const pressed = current === f.filter ? 'true' : 'false';
      const tone = f.tone ? ` data-tone="${f.tone}"` : '';
      return `<button class="filter-chip device-stat-chip${active}" data-filter="${f.filter}" type="button" aria-pressed="${pressed}"${tone}><span class="stat-label">${f.label}</span><span class="stat-count">${f.count}</span></button>`;
    })
    .join('');
}

/**
 * 渲染单张设备卡片（卡片视图）
 */
function renderDeviceCard(item) {
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
            ${renderStatusPill(item)}
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
}

/**
 * 渲染状态 pill：管理者为可点按钮（弹快改菜单），访客为纯展示
 */
function renderStatusPill(item) {
  const label = escapeHtml(deviceStatusLabel(item.status));
  const status = escapeHtml(item.status);
  if (canManageDevices()) {
    return `<button class="status-pill" data-status="${status}" data-device-status="${escapeHtml(item.id)}" type="button" aria-label="修改状态" title="点击修改状态">${label}</button>`;
  }
  return `<span class="status-pill" data-status="${status}">${label}</span>`;
}

/**
 * 渲染表格行（表格视图）
 */
function renderDeviceTableRow(item) {
  const hasImage = item.image && item.image.trim();
  const modelHtml = item.model ? `<p class="cell-model">${escapeHtml(item.model)}</p>` : '';
  const actionsHtml = canManageDevices()
    ? `<div class="device-row-actions">
        <button class="ghost-btn" data-device-edit="${escapeHtml(item.id)}" type="button">编辑</button>
        <button class="ghost-btn" data-device-delete="${escapeHtml(item.id)}" type="button">删除</button>
      </div>`
    : '';
  return `
    <div class="device-table-row" data-status="${escapeHtml(item.status)}">
      <div class="cell-device">
        <div class="cell-thumb" data-status-ring="${escapeHtml(item.status)}">
          ${hasImage
            ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
            : `<span class="device-thumb-icon" data-category="${escapeHtml(item.category || '')}">${pickCategoryIcon(item.category)}</span>`
          }
        </div>
        <div class="cell-name">
          <h3>${escapeHtml(item.name)}</h3>
          ${modelHtml}
        </div>
      </div>
      <div class="cell-asset" data-label="编号">${escapeHtml(item.assetNo)}</div>
      <div class="cell-category" data-label="类别">${escapeHtml(item.category)}</div>
      <div class="cell-status" data-label="状态">${renderStatusPill(item)}</div>
      <div class="cell-location" data-label="位置">${escapeHtml(item.location || '-')}</div>
      <div class="cell-owner" data-label="责任人">${escapeHtml(item.owner || '-')}</div>
      <div class="cell-actions">${actionsHtml}</div>
    </div>
  `;
}

/**
 * 渲染设备列表
 */
export function renderDevices() {
  applyDeviceRoleVisibility();
  renderDeviceStatFilters();

  const items = Array.isArray(state.deviceItems) ? state.deviceItems : [];
  if (!els.deviceList) return;

  const viewMode = state.deviceViewMode === 'grid' ? 'grid' : 'table';
  els.deviceList.classList.toggle('is-table', viewMode === 'table');
  els.deviceList.classList.toggle('is-grid', viewMode === 'grid');
  // 视图切换按钮态
  if (els.deviceViewTable) {
    const isTable = viewMode === 'table';
    els.deviceViewTable.classList.toggle('is-active', isTable);
    els.deviceViewTable.setAttribute('aria-pressed', String(isTable));
  }
  if (els.deviceViewGrid) {
    const isGrid = viewMode === 'grid';
    els.deviceViewGrid.classList.toggle('is-active', isGrid);
    els.deviceViewGrid.setAttribute('aria-pressed', String(isGrid));
  }

  if (!items.length) {
    els.deviceList.innerHTML = `<div class="empty-state"><strong>没有设备记录</strong><p>${canManageDevices() ? '点击上方「新增设备」按钮添加第一台设备。' : '暂无可查看的设备台账。'}</p></div>`;
    return;
  }

  if (viewMode === 'grid') {
    els.deviceList.innerHTML = items.map(renderDeviceCard).join('');
    return;
  }

  // 表格视图：表头 + 行
  els.deviceList.innerHTML =
    `<div class="device-table" role="table" aria-label="设备台账">
      <div class="device-table-head" role="row">
        <span class="cell-device">设备</span>
        <span class="cell-asset">编号</span>
        <span class="cell-category">类别</span>
        <span class="cell-status">状态</span>
        <span class="cell-location">位置</span>
        <span class="cell-owner">责任人</span>
        <span class="cell-actions">操作</span>
      </div>
      ${items.map(renderDeviceTableRow).join('')}
    </div>`;
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
    closeDeviceDrawer();
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
    // 仅在抽屉式编辑时关闭；行内状态快改不打开抽屉，无需关闭
    if (updates && !updates.statusOnly && els.deviceDrawer && !els.deviceDrawer.hidden) {
      closeDeviceDrawer();
    }
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
 * 开始编辑设备：填充表单字段
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
 * 取消编辑设备：重置表单并关闭抽屉
 */
export function cancelEditDevice() {
  state.deviceEditingId = null;
  if (els.deviceForm) els.deviceForm.reset();
  setDeviceImagePreview('');
  if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存设备';
  if (els.deviceFormId) els.deviceFormId.value = '';
  closeDeviceDrawer();
  applyDeviceRoleVisibility();
}

/**
 * 打开登记抽屉
 * @param {'add'|'edit'} mode
 * @param {string|null} id - 编辑模式下的设备 ID
 */
export function openDeviceDrawer(mode = 'add', id = null) {
  if (!canManageDevices()) {
    Toast.warning('当前身份无权管理设备');
    return;
  }
  if (mode === 'edit' && id) {
    startEditDevice(id);
    if (els.deviceDrawerTitle) els.deviceDrawerTitle.textContent = '编辑设备';
  } else {
    // 新增模式：重置表单
    state.deviceEditingId = null;
    if (els.deviceForm) els.deviceForm.reset();
    setDeviceImagePreview('');
    if (els.deviceFormSubmit) els.deviceFormSubmit.textContent = '保存设备';
    if (els.deviceFormId) els.deviceFormId.value = '';
    if (els.deviceDrawerTitle) els.deviceDrawerTitle.textContent = '新增设备';
  }
  if (els.deviceDrawer) els.deviceDrawer.hidden = false;
  applyDeviceRoleVisibility();
}

/**
 * 关闭登记抽屉
 */
export function closeDeviceDrawer() {
  if (els.deviceDrawer && !els.deviceDrawer.hidden) els.deviceDrawer.hidden = true;
}

/**
 * 打开行内状态快改弹层
 * @param {string} id - 设备 ID
 * @param {HTMLElement} triggerEl - 触发按钮
 */
export function openDeviceStatusPopover(id, triggerEl) {
  if (!canManageDevices()) {
    Toast.warning('当前身份无权修改状态');
    return;
  }
  const pop = els.deviceStatusPopover;
  if (!pop) return;
  _statusPopoverTarget = { id, triggerEl };
  pop.innerHTML = STATUS_OPTIONS.map(
    (opt) =>
      `<button class="status-pill" data-status="${opt.value}" data-status-option="${opt.value}" type="button" role="menuitem" aria-label="设为${opt.label}">${opt.label}</button>`,
  ).join('');
  pop.hidden = false;
  pop.setAttribute('aria-hidden', 'false');
  pop.classList.add('is-open');
  positionDeviceStatusPopover(triggerEl);
}

/**
 * 关闭行内状态快改弹层
 */
export function closeDeviceStatusPopover() {
  const pop = els.deviceStatusPopover;
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.setAttribute('aria-hidden', 'true');
  pop.classList.remove('is-open');
  pop.style.top = '';
  pop.style.left = '';
  pop.innerHTML = '';
  _statusPopoverTarget = null;
}

/**
 * 定位弹层到触发按钮下方（视口坐标，body 层 fixed）
 */
function positionDeviceStatusPopover(triggerEl) {
  const pop = els.deviceStatusPopover;
  if (!pop || !triggerEl) return;
  const rect = triggerEl.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const margin = 6;
  let top = rect.bottom + margin;
  let left = rect.left;
  if (top + popRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popRect.height - margin);
  }
  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popRect.width - margin);
  }
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

/**
 * 确认状态快改（弹层选项点击 / 键盘确认时调用）
 * @param {string} status
 */
export async function confirmDeviceStatus(status) {
  if (!_statusPopoverTarget) return;
  const { id } = _statusPopoverTarget;
  closeDeviceStatusPopover();
  await updateDevice(id, { status, statusOnly: true });
}
