/**
 * 团队协作管理模块
 * 负责团队成员的渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, formatDatetime } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { setPending } from '../ui/feedback.js';

/**
 * 检查是否为管理员
 * @returns {boolean}
 */
function isAdminUser() {
  return state.session?.user?.role === 'admin';
}

/**
 * 检查团队成员是否匹配过滤条件
 * @param {Object} item - 团队成员对象
 * @returns {boolean}
 */
function teamMatchesFilter(item) {
  const filter = state.teamFilter;
  if (filter === 'all') return true;
  return item.status === filter;
}

/**
 * 检查团队成员是否匹配搜索关键词
 * @param {Object} item - 团队成员对象
 * @param {string} search - 搜索关键词
 * @returns {boolean}
 */
function matchesTeamSearch(item, search) {
  if (!search) return true;
  const source = [item.name, item.role, item.email, item.phone, item.note]
    .join(' ')
    .toLowerCase();
  return source.includes(search.toLowerCase());
}

/**
 * 获取团队统计信息
 * @returns {Object}
 */
export function getTeamStats() {
  const items = state.bootstrap?.team || [];
  return {
    total: items.length,
    active: items.filter((item) => item.status === 'active').length,
    leave: items.filter((item) => item.status === 'leave').length,
    inactive: items.filter((item) => item.status === 'inactive').length,
  };
}

/**
 * 渲染团队成员列表
 */
export function renderTeam() {
  const allItems = state.bootstrap?.team || [];
  const items = allItems
    .filter((item) => teamMatchesFilter(item) && matchesTeamSearch(item, state.teamSearch));

  // 排序
  if (state.teamSort === 'name') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (state.teamSort === 'role') {
    items.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
  } else if (state.teamSort === 'joined') {
    items.sort((a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || ''));
  }

  const stats = getTeamStats();
  if (els.teamCount) {
    els.teamCount.textContent = `${items.length} 位成员 (在职: ${stats.active}, 休假: ${stats.leave}, 离职: ${stats.inactive})`;
  }

  const isAdmin = isAdminUser();
  if (!els.teamGrid) return;

  els.teamGrid.innerHTML = items.length
    ? items
      .map(
        (item) => `
            <article class="team-card" data-status="${escapeHtml(item.status || 'active')}" data-team-id="${escapeHtml(item.id)}">
              <div class="team-head">
                <span class="team-badge">${escapeHtml(item.badge || item.name?.slice(0, 1) || '团')}</span>
                <div>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>${escapeHtml(item.role)}</p>
                </div>
                <span class="team-status-dot" data-status="${escapeHtml(item.status || 'active')}" title="${item.status === 'active' ? '在职' : item.status === 'leave' ? '休假' : '离职'}"></span>
              </div>
              <small class="team-note">${escapeHtml(item.note || '暂无职责描述')}</small>
              <div class="team-meta">
                ${item.email ? `<span>📧 ${escapeHtml(item.email)}</span>` : ''}
                ${item.phone ? `<span>📱 ${escapeHtml(item.phone)}</span>` : ''}
                ${item.joinedAt ? `<span>📅 入职 ${escapeHtml(formatDatetime(item.joinedAt).split(' ')[0])}</span>` : ''}
              </div>
              <div class="team-actions">
                ${isAdmin ? `<button class="ghost-btn" data-team-move-up="${escapeHtml(item.id)}" type="button" title="上移">↑</button><button class="ghost-btn" data-team-move-down="${escapeHtml(item.id)}" type="button" title="下移">↓</button>` : ''}
                <button class="ghost-btn" data-team-edit="${escapeHtml(item.id)}" type="button">编辑</button>
                <button class="ghost-btn" data-team-delete="${escapeHtml(item.id)}" type="button">删除</button>
              </div>
            </article>
          `,
      )
      .join('')
    : '<div class="empty-state"><strong>没有找到团队成员</strong><p>可以尝试清空筛选条件。</p></div>';
}

/**
 * 创建团队成员
 * @param {FormData} formData - 表单数据
 */
export async function createTeamMember(formData) {
  const name = formData.get('name')?.trim();
  const role = formData.get('role')?.trim();
  const email = formData.get('email')?.trim() || null;
  const phone = formData.get('phone')?.trim() || null;
  const note = formData.get('note')?.trim() || null;
  const status = formData.get('status') || 'active';
  const joinedAt = formData.get('joinedAt') || null;

  if (!name || !role) {
    Toast.warning('请输入姓名和职位');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/team', {
      method: 'POST',
      body: { name, role, email, phone, note, status, joinedAt },
    });

    // 添加到本地状态
    if (state.bootstrap?.team) {
      state.bootstrap.team.push(result.member || result);
    }

    Toast.success('团队成员已添加');
    renderTeam();

    // 清空表单
    if (els.teamForm) els.teamForm.reset();
    state.teamEditingId = null;
  } catch (error) {
    Toast.error(error.message || '添加失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 更新团队成员
 * @param {string} id - 成员 ID
 * @param {Object} updates - 更新数据
 */
export async function updateTeamMember(id, updates) {
  try {
    setPending(true);
    const result = await requestJSON(`/api/team/${id}`, {
      method: 'PATCH',
      body: updates,
    });

    // 更新本地状态
    const team = state.bootstrap?.team || [];
    const member = team.find((m) => m.id === id);
    if (member) {
      Object.assign(member, result.member || updates);
    }

    Toast.success('团队成员已更新');
    state.teamEditingId = null;
    renderTeam();
    return result;
  } catch (error) {
    Toast.error(error.message || '更新失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 删除团队成员
 * @param {string} id - 成员 ID
 */
export async function deleteTeamMember(id) {
  if (!confirm('确定要删除这个团队成员吗？')) {
    return;
  }

  try {
    setPending(true);
    await requestJSON(`/api/team/${id}`, { method: 'DELETE' });

    // 从本地状态中移除
    if (state.bootstrap?.team) {
      state.bootstrap.team = state.bootstrap.team.filter((m) => m.id !== id);
    }

    Toast.success('团队成员已删除');
    renderTeam();
  } catch (error) {
    Toast.error(error.message || '删除失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 移动团队成员位置
 * @param {string} id - 成员 ID
 * @param {string} direction - 方向 (up, down)
 */
export async function moveTeamMember(id, direction) {
  const team = state.bootstrap?.team || [];
  const index = team.findIndex((m) => m.id === id);
  if (index === -1) return;

  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= team.length) return;

  try {
    setPending(true);

    // 交换位置
    [team[index], team[newIndex]] = [team[newIndex], team[index]];

    // 更新服务器
    await requestJSON(`/api/team/${id}/move`, {
      method: 'POST',
      body: { direction },
    });

    Toast.success('位置已调整');
    renderTeam();
  } catch (error) {
    // 恢复原位置
    [team[index], team[newIndex]] = [team[newIndex], team[index]];
    Toast.error(error.message || '调整失败');
    throw error;
  } finally {
    setPending(false);
  }
}

/**
 * 开始编辑团队成员
 * @param {string} id - 成员 ID
 */
export function startEditTeamMember(id) {
  state.teamEditingId = id;
  const member = (state.bootstrap?.team || []).find((m) => m.id === id);
  if (!member || !els.teamForm) return;

  // 填充表单
  const form = els.teamForm;
  if (form.name) form.name.value = member.name || '';
  if (form.role) form.role.value = member.role || '';
  if (form.email) form.email.value = member.email || '';
  if (form.phone) form.phone.value = member.phone || '';
  if (form.note) form.note.value = member.note || '';
  if (form.status) form.status.value = member.status || 'active';
  if (form.joinedAt) form.joinedAt.value = member.joinedAt || '';

  // 更新表单按钮
  if (els.teamFormSubmit) els.teamFormSubmit.textContent = '保存修改';
}

/**
 * 取消编辑团队成员
 */
export function cancelEditTeamMember() {
  state.teamEditingId = null;
  if (els.teamForm) els.teamForm.reset();
  if (els.teamFormSubmit) els.teamFormSubmit.textContent = '添加成员';
}

/**
 * 保存编辑的团队成员
 * @param {string} id - 成员 ID
 * @param {FormData} formData - 表单数据
 */
export async function saveEditTeamMember(id, formData) {
  const name = formData.get('name')?.trim();
  const role = formData.get('role')?.trim();
  const email = formData.get('email')?.trim() || null;
  const phone = formData.get('phone')?.trim() || null;
  const note = formData.get('note')?.trim() || null;
  const status = formData.get('status') || 'active';
  const joinedAt = formData.get('joinedAt') || null;

  if (!name || !role) {
    Toast.warning('请输入姓名和职位');
    return;
  }

  await updateTeamMember(id, { name, role, email, phone, note, status, joinedAt });
}
