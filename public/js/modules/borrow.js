/**
 * 借出申请管理模块
 * 负责借出申请的渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, formatDatetime, isAdminUser, addLocalActivity } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending } from '../ui/feedback.js';
import { deviceStatusLabel, getDeviceSourceItems } from './device.js';

/**
 * 检查借出是否逾期
 * @param {string} expectedReturnAt - 预期归还时间
 * @param {string} returnStatus - 归还状态
 * @returns {boolean}
 */
export function isOverdue(expectedReturnAt, returnStatus) {
  if (returnStatus === 'returned') return false;
  if (!expectedReturnAt) return false;
  return new Date(expectedReturnAt) < new Date();
}

/**
 * 获取借出统计信息
 * @returns {Object}
 */
export function getBorrowStats() {
  const items = Array.isArray(state.borrowItems) ? state.borrowItems : [];
  const overdue = items.filter((item) => item.status === 'approved' && isOverdue(item.expectedReturnAt, item.returnStatus));
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved' && item.returnStatus !== 'returned').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
    returned: items.filter((item) => item.returnStatus === 'returned').length,
    cancelled: items.filter((item) => item.status === 'cancelled').length,
    overdue: overdue.length,
    overdueList: overdue,
  };
}

/**
 * 检查借出是否匹配视图条件
 * @param {Object} item - 借出对象
 * @returns {boolean}
 */
export function borrowMatchesView(item) {
  const search = String(state.borrowSearch || '').trim().toLowerCase();
  if (state.borrowFilter === 'overdue') {
    if (!(item.status === 'approved' && isOverdue(item.expectedReturnAt, item.returnStatus))) return false;
  } else if (state.borrowFilter === 'returned') {
    if (item.returnStatus !== 'returned') return false;
  } else if (state.borrowFilter === 'approved') {
    if (!(item.status === 'approved' && item.returnStatus !== 'returned')) return false;
  } else if (state.borrowFilter !== 'all' && item.status !== state.borrowFilter) {
    return false;
  }
  if (!search) return true;
  return [
    item.applicant,
    item.deviceName,
    item.deviceId,
    item.purpose,
    item.status,
    item.returnStatus,
    item.approvedBy,
    item.note,
  ]
    .join(' ')
    .toLowerCase()
    .includes(search);
}

/**
 * 获取借出源数据
 * @returns {Array}
 */
export function getBorrowSourceItems() {
  return Array.isArray(state.borrowCatalog) ? state.borrowCatalog : [];
}

/**
 * 获取可借设备列表
 * @returns {Array}
 */
export function getAvailableBorrowDevices() {
  return getDeviceSourceItems().filter((item) => item.status === 'available');
}

/**
 * 同步借出视图
 * @returns {Array}
 */
export function syncBorrowView() {
  const items = getBorrowSourceItems().filter((item) => borrowMatchesView(item));
  state.borrowItems = items;
  renderBorrowRequests();
  return items;
}

/**
 * 渲染借出设备选择器
 */
export function renderBorrowDeviceSelect() {
  if (!els.borrowDeviceSelect) return;
  const devices = getAvailableBorrowDevices();
  els.borrowDeviceSelect.innerHTML = devices.length
    ? devices
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(deviceStatusLabel(item.status))}</option>`)
      .join('')
    : '<option value="">暂无可选设备</option>';
}

/**
 * 渲染借出申请列表
 */
export function renderBorrowRequests() {
  const items = Array.isArray(state.borrowItems) ? state.borrowItems : [];
  const stats = getBorrowStats();
  if (els.borrowCount) {
    els.borrowCount.textContent = `${items.length} 条申请 (待审: ${stats.pending}, 借出中: ${stats.approved}, 逾期: ${stats.overdue})`;
  }
  if (!els.borrowList) return;

  els.borrowList.innerHTML = items.length
    ? items
      .map(
        (item) => {
          const overdue = isOverdue(item.expectedReturnAt, item.returnStatus);
          const overdueDays = overdue ? Math.floor((Date.now() - new Date(item.expectedReturnAt).getTime()) / 86400000) : 0;
          const overdueDetail = overdueDays > 0 ? ` (${overdueDays}天)` : '';
          const statusLabel =
              item.status === 'pending'
                ? '待审批'
                : item.status === 'approved'
                  ? item.returnStatus === 'returned'
                    ? '已归还'
                    : overdue
                      ? `逾期未还${overdueDetail}`
                      : '借出中'
                  : item.status === 'cancelled'
                    ? '已撤销'
                    : '已拒绝';
          const statusTone =
              item.status === 'pending'
                ? 'warning'
                : item.status === 'approved'
                  ? item.returnStatus === 'returned'
                    ? 'success'
                    : overdue
                      ? 'danger'
                      : 'info'
                  : 'neutral';
          const actionLabel = `${item.applicant || '申请人'}的${item.deviceName || item.deviceId || '设备'}借用申请`;
          const adminActions = isAdminUser()
            ? item.status === 'pending'
              ? `<button class="primary-btn" data-borrow-approve="${escapeHtml(item.id)}" type="button" aria-label="批准${escapeHtml(actionLabel)}">批准</button>
                         <button class="ghost-btn" data-borrow-reject="${escapeHtml(item.id)}" type="button" aria-label="拒绝${escapeHtml(actionLabel)}">拒绝</button>`
              : item.status === 'approved' && item.returnStatus !== 'returned'
                ? `<button class="primary-btn" data-borrow-return="${escapeHtml(item.id)}" type="button" aria-label="确认${escapeHtml(actionLabel)}已归还">确认归还</button>`
                : ''
            : item.status === 'pending'
              ? `<button class="ghost-btn" data-borrow-cancel="${escapeHtml(item.id)}" type="button" aria-label="撤销${escapeHtml(actionLabel)}">撤销申请</button>`
              : '';
          const deleteAction = isAdminUser()
            ? `<button class="ghost-btn" data-borrow-delete="${escapeHtml(item.id)}" type="button" aria-label="删除${escapeHtml(actionLabel)}记录">删除</button>`
            : '';
          return `
              <article class="borrow-item" role="listitem" data-status="${escapeHtml(item.status)}" ${overdue ? 'data-overdue="true"' : ''}>
                <div class="borrow-head">
                  <div>
                    <h3>${escapeHtml(item.applicant)}</h3>
                    <p>${escapeHtml(item.deviceName || item.deviceId)}</p>
                  </div>
                  <span class="status-pill" data-tone="${statusTone}">${escapeHtml(statusLabel)}</span>
                </div>
                <p class="borrow-purpose">${escapeHtml(item.purpose)}</p>
                <div class="borrow-meta">
                  <span>申请时间：${escapeHtml(formatDatetime(item.createdAt))}</span>
                  ${item.expectedReturnAt ? `<span>预计归还：${escapeHtml(formatDatetime(item.expectedReturnAt))}</span>` : ''}
                  ${item.approvedBy ? `<span>审批人：${escapeHtml(item.approvedBy)}</span>` : ''}
                </div>
                ${item.note ? `<small class="borrow-note">备注：${escapeHtml(item.note)}</small>` : ''}
                ${item.rejectReason ? `<small class="borrow-note" data-tone="danger">拒绝原因：${escapeHtml(item.rejectReason)}</small>` : ''}
                ${(adminActions || deleteAction) ? `<div class="borrow-actions">${adminActions}${deleteAction}</div>` : ''}
              </article>
            `;
        },
      )
      .join('')
    : '<div class="empty-state"><strong>没有借出申请</strong><p>点击上方"提交申请"按钮创建第一条借出申请。</p></div>';
}

/**
 * 构建借出查询参数
 * @returns {string}
 */
export function buildBorrowQuery() {
  const params = new URLSearchParams();
  const search = String(state.borrowSearch || '').trim();
  if (search) params.set('search', search);
  if (state.borrowFilter && state.borrowFilter !== 'all') params.set('status', state.borrowFilter);
  return params.toString();
}

/**
 * 刷新借出申请列表
 * @param {Object} options - 选项
 * @returns {Promise<Array>}
 */
export async function refreshBorrowRequests({ scope = 'view', silent = false } = {}) {
  if (!state.session?.authenticated) return [];

  try {
    const endpoint =
      scope === 'catalog'
        ? '/api/borrow-requests'
        : (() => {
          const query = buildBorrowQuery();
          return query ? `/api/borrow-requests?${query}` : '/api/borrow-requests';
        })();

    const result = await requestJSON(endpoint);
    const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];

    if (scope === 'catalog') {
      state.borrowCatalog = items;
      return syncBorrowView();
    }
    state.borrowItems = items;
    renderBorrowRequests();
    return items;
  } catch (error) {
    if (!silent) {
      Toast.error(error.message || '刷新借出列表失败');
    }
    throw error;
  }
}

/**
 * 创建借出申请
 * @param {FormData} formData - 表单数据
 */
export async function createBorrowRequest(formData) {
  const applicant = formData.get('applicant')?.trim();
  const deviceId = formData.get('deviceId');
  const purpose = formData.get('purpose')?.trim();
  const borrowAt = formData.get('borrowAt') || null;
  const expectedReturnAt = formData.get('expectedReturnAt') || null;
  const note = formData.get('note')?.trim() || '';

  if (!applicant || !deviceId || !purpose || !borrowAt || !expectedReturnAt) {
    Toast.warning('请填写申请人、设备、借用目的和时间');
    return;
  }
  if (new Date(borrowAt) >= new Date(expectedReturnAt)) {
    Toast.warning('预计归还时间必须晚于借出时间');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/borrow-requests', {
      method: 'POST',
      body: { applicant, deviceId, purpose, borrowAt, expectedReturnAt, note },
    });

    // 添加到本地状态
    if (state.borrowCatalog) {
      state.borrowCatalog.push(result.item || result.request || result);
    }

    Toast.success('借出申请已提交');
    addLocalActivity('借用申请', `${applicant} 提交了借用申请`);
    syncBorrowView();

    // 清空表单
    if (els.borrowForm) els.borrowForm.reset();
  } catch (error) {
    Toast.error(error.message || '提交失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 审批借出申请
 * @param {string} id - 申请 ID
 * @param {string} status - 状态 (approved, rejected)
 */
export async function approveBorrowRequest(id, status) {
  let rejectReason = '';
  if (status === 'rejected') {
    rejectReason = (await Dialog.prompt({
      title: '拒绝借出申请',
      message: '请输入拒绝原因（可选）：',
      placeholder: '请输入拒绝原因',
      confirmText: '确认拒绝',
      cancelText: '跳过',
    })) ?? '';
  }

  try {
    setPending(true);
    const result = await requestJSON(`/api/borrow-requests/${id}`, {
      method: 'PATCH',
      body: { status, ...(status === 'rejected' && { rejectReason }) },
    });

    // 更新本地状态
    const requests = state.borrowCatalog || [];
    const request = requests.find((r) => r.id === id);
    if (request) {
      Object.assign(request, result.item || result.request || { status });
    }

    Toast.success(status === 'approved' ? '已批准借出' : '已拒绝申请');
    addLocalActivity('借用审核', status === 'approved' ? '通过了一条借用申请' : '拒绝了一条借用申请');
    syncBorrowView();
    return result;
  } catch (error) {
    Toast.error(error.message || '审批失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 确认归还
 * @param {string} id - 申请 ID
 */
export async function returnBorrowRequest(id) {
  try {
    setPending(true);
    const result = await requestJSON(`/api/borrow-requests/${id}`, {
      method: 'PATCH',
      body: { returnStatus: 'returned' },
    });

    // 更新本地状态
    const requests = state.borrowCatalog || [];
    const request = requests.find((r) => r.id === id);
    if (request) {
      Object.assign(request, result.item || {
        returnStatus: 'returned',
        returnedAt: new Date().toISOString(),
      });
    }

    Toast.success('已确认归还');
    addLocalActivity('设备归还', '确认了一条设备归还记录');
    syncBorrowView();
    return result;
  } catch (error) {
    Toast.error(error.message || '操作失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 撤销借用申请（申请人自行撤销待审申请）
 * @param {string} id - 申请 ID
 */
export async function cancelBorrowRequest(id) {
  const confirmed = await Dialog.confirm({
    title: '撤销申请',
    message: '确定要撤销这条借用申请吗？',
    confirmText: '撤销',
    cancelText: '取消',
    variant: 'warning',
  });
  if (!confirmed) return;

  try {
    setPending(true);
    const result = await requestJSON(`/api/borrow-requests/${id}/cancel`, { method: 'POST' });

    if (state.borrowCatalog) {
      const req = state.borrowCatalog.find((r) => r.id === id);
      if (req) Object.assign(req, result.item || { status: 'cancelled' });
    }

    Toast.success('申请已撤销');
    addLocalActivity('借用申请撤销', '撤销了一条借用申请');
    syncBorrowView();
  } catch (error) {
    Toast.error(error.message || '撤销失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 删除借出申请
 * @param {string} id - 申请 ID
 */
export async function deleteBorrowRequest(id) {
  const confirmed = await Dialog.confirm({
    title: '删除借出记录',
    message: '确定要删除这条借出申请吗？',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) {
    return;
  }

  try {
    setPending(true);
    await requestJSON(`/api/borrow-requests/${id}`, { method: 'DELETE' });

    // 从本地状态中移除
    if (state.borrowCatalog) {
      state.borrowCatalog = state.borrowCatalog.filter((r) => r.id !== id);
    }

    Toast.success('借出申请已删除');
    addLocalActivity('借用记录删除', '删除了一条借用记录');
    syncBorrowView();
  } catch (error) {
    Toast.error(error.message || '删除失败');
    throw error;
  } finally {
    setPending(false);
  }
}
