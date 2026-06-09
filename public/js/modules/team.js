/**
 * 团队协作管理模块
 * 负责团队成员的渲染和 CRUD 操作
 */

import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { escapeHtml, formatDatetime } from '../utils/helpers.js';
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { Dialog } from '../ui/dialog.js';
import { setPending } from '../ui/feedback.js';

/**
 * 检查是否为管理员
 * @returns {boolean}
 */
function isAdminUser() {
  return state.session?.user?.role === 'admin';
}

function normalizeGroups(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function contributionOf(item) {
  return Number(item.contribution?.count || 0);
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
  const source = [item.name, item.role, item.email, item.phone, item.note, item.major, item.skills, item.studentId, item.grade, normalizeGroups(item.groups).join(' ')]
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
  const byGrade = {};
  const byGroup = {};
  items.forEach((item) => {
    if (item.grade) byGrade[item.grade] = (byGrade[item.grade] || 0) + 1;
    normalizeGroups(item.groups).forEach((g) => {
      byGroup[g] = (byGroup[g] || 0) + 1;
    });
  });
  return {
    total: items.length,
    active: items.filter((item) => item.status === 'active').length,
    leave: items.filter((item) => item.status === 'leave').length,
    inactive: items.filter((item) => item.status === 'inactive').length,
    byGrade,
    byGroup,
  };
}

function renderTeamStats(stats) {
  if (!els.teamStats) return;
  const topGroup = Object.entries(stats.byGroup).sort((a, b) => b[1] - a[1])[0];
  els.teamStats.innerHTML = `
    <button class="stat-card" data-tone="success" type="button"><strong>${escapeHtml(stats.active)}</strong><span>活跃成员</span></button>
    <button class="stat-card" data-tone="warning" type="button"><strong>${escapeHtml(stats.leave)}</strong><span>请假成员</span></button>
    <button class="stat-card" data-tone="neutral" type="button"><strong>${escapeHtml(Object.keys(stats.byGrade).length)}</strong><span>年级覆盖</span></button>
    <button class="stat-card" data-tone="neutral" type="button"><strong>${escapeHtml(topGroup ? topGroup[1] : 0)}</strong><span>${escapeHtml(topGroup ? topGroup[0] : '小组协作')}</span></button>
  `;
}

export function renderTeamLeaderboard() {
  if (!els.teamLeaderboard) return;
  const ranked = [...(state.bootstrap?.team || [])]
    .sort((a, b) => contributionOf(b) - contributionOf(a))
    .slice(0, 5);

  els.teamLeaderboard.innerHTML = ranked.length
    ? `
      <div class="leaderboard-head">
        <div><p class="eyebrow">学习与活动</p><strong>成员贡献榜</strong></div>
        <span>按近期活动记录估算</span>
      </div>
      <div class="leaderboard-list">
        ${ranked.map((item, index) => `
          <article class="leaderboard-item">
            <span class="leaderboard-rank">${index + 1}</span>
            <div>
              <strong>${escapeHtml(item.name || '-')}</strong>
              <small>${escapeHtml(item.role || '成员')} · ${escapeHtml(normalizeGroups(item.groups)[0] || item.grade || '协作成员')}</small>
            </div>
            <b>${escapeHtml(contributionOf(item))}</b>
          </article>
        `).join('')}
      </div>
    `
    : '';
}

/**
 * 渲染团队成员列表
 */
export function renderTeam() {
  const allItems = state.bootstrap?.team || [];
  const items = allItems
    .filter((item) => teamMatchesFilter(item) && matchesTeamSearch(item, state.teamSearch));

  if (state.teamSort === 'name') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (state.teamSort === 'role') {
    items.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
  } else if (state.teamSort === 'joined' || state.teamSort === 'joinedAt-desc') {
    items.sort((a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || ''));
  } else if (state.teamSort === 'joinedAt-asc') {
    items.sort((a, b) => (a.joinedAt || '').localeCompare(b.joinedAt || ''));
  }

  const stats = getTeamStats();
  if (els.teamCount) {
    els.teamCount.textContent = `${items.length} 位成员 (活跃: ${stats.active}, 请假: ${stats.leave}, 已离开: ${stats.inactive})`;
  }
  renderTeamStats(stats);
  renderTeamLeaderboard();

  const isAdmin = isAdminUser();
  if (!els.teamGrid) return;

  els.teamGrid.innerHTML = items.length
    ? items
      .map(
        (item) => {
          const statusLabels = { active: '活跃', leave: '请假', inactive: '已离开' };
          const statusTitle = statusLabels[item.status] || '活跃';
          const gradeMajor = [item.grade, item.major].filter(Boolean).join(' · ');
          const skillTags = (item.skills || '').split(',').map(s => s.trim()).filter(Boolean);
          const groups = normalizeGroups(item.groups);
          const recent = item.contribution?.recent?.[0];
          return `
            <article class="team-card" data-status="${escapeHtml(item.status || 'active')}" data-grade="${escapeHtml(item.grade || '')}" data-team-id="${escapeHtml(item.id)}">
              <div class="team-head">
                <span class="team-badge" data-grade="${escapeHtml(item.grade || '默认')}">${escapeHtml(item.badge || item.name?.slice(0, 1) || '团')}</span>
                <div class="team-head-info">
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>${escapeHtml(item.role)}${gradeMajor ? `<span class="team-grade-major"> · ${escapeHtml(gradeMajor)}</span>` : ''}</p>
                  ${item.studentId ? `<small class="team-student-id">学号: ${escapeHtml(item.studentId)}</small>` : ''}
                </div>
                <div class="team-status-wrap">
                  <span class="team-role-pill">${escapeHtml(item.grade || '成员')}</span>
                  <span class="team-status-dot" data-status="${escapeHtml(item.status || 'active')}" title="${statusTitle}"></span>
                </div>
              </div>
              ${item.bio ? `<p class="team-bio">${escapeHtml(item.bio)}</p>` : `<small class="team-note">${escapeHtml(item.note || '暂无负责内容')}</small>`}
              ${groups.length ? `<div class="team-group-chips">${groups.map(g => `<span class="team-group-chip">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
              ${skillTags.length ? `<div class="skill-tags">${skillTags.map(t => `<span class="skill-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
              <div class="team-contribution">
                <strong>${escapeHtml(contributionOf(item))}</strong><span>活动贡献</span>
                ${recent ? `<small>最近：${escapeHtml(recent.title || recent.detail || '有新动态')}</small>` : '<small>等待新的协作动态</small>'}
              </div>
              <div class="team-meta">
                ${item.email ? `<span>${escapeHtml(item.email)}</span>` : ''}
                ${item.phone ? `<span>${escapeHtml(item.phone)}</span>` : ''}
                ${item.partyJoinAt ? `<span>入团 / 入党 ${escapeHtml(item.partyJoinAt)}</span>` : ''}
                ${item.joinedAt ? `<span>加入 ${escapeHtml(formatDatetime(item.joinedAt).split(' ')[0])}</span>` : ''}
              </div>
              <div class="team-actions">
                ${isAdmin ? `<button class="ghost-btn" data-team-move-up="${escapeHtml(item.id)}" type="button" aria-label="上移 ${escapeHtml(item.name)}">↑</button><button class="ghost-btn" data-team-move-down="${escapeHtml(item.id)}" type="button" aria-label="下移 ${escapeHtml(item.name)}">↓</button>` : ''}
                <button class="ghost-btn" data-team-edit="${escapeHtml(item.id)}" type="button" aria-label="编辑成员 ${escapeHtml(item.name)}">编辑</button>
                <button class="ghost-btn" data-team-delete="${escapeHtml(item.id)}" type="button" aria-label="删除成员 ${escapeHtml(item.name)}">删除</button>
              </div>
            </article>
          `;
        },
      )
      .join('')
    : '<div class="empty-state"><strong>没有找到团队成员</strong><p>可以尝试清空筛选条件。</p></div>';
}

export async function loadTeamContribution() {
  const team = state.bootstrap?.team || [];
  if (!team.length || !state.session?.authenticated) return;
  const results = await Promise.allSettled(
    team.map((item) => requestJSON(`/api/team/${encodeURIComponent(item.id)}/contribution`)),
  );
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      team[index].contribution = {
        count: result.value.count || 0,
        recent: result.value.recent || [],
      };
    }
  });
  renderTeam();
}

function formPayload(formData) {
  return {
    name: formData.get('name')?.trim(),
    role: formData.get('role')?.trim(),
    grade: formData.get('grade')?.trim() || null,
    major: formData.get('major')?.trim() || null,
    studentId: formData.get('studentId')?.trim() || null,
    groups: normalizeGroups(formData.get('groups')),
    partyJoinAt: formData.get('partyJoinAt') || null,
    skills: formData.get('skills')?.trim() || null,
    bio: formData.get('bio')?.trim() || null,
    email: formData.get('email')?.trim() || null,
    phone: formData.get('phone')?.trim() || null,
    note: formData.get('note')?.trim() || null,
    badge: formData.get('badge')?.trim() || null,
    status: formData.get('status') || 'active',
    joinedAt: formData.get('joinedAt') || null,
  };
}

/**
 * 创建团队成员
 * @param {FormData} formData - 表单数据
 */
export async function createTeamMember(formData) {
  const payload = formPayload(formData);

  if (!payload.name || !payload.role) {
    Toast.warning('请输入姓名和团队角色');
    return;
  }

  try {
    setPending(true);
    const result = await requestJSON('/api/team', {
      method: 'POST',
      body: payload,
    });

    if (state.bootstrap?.team) {
      state.bootstrap.team.push(result.item || result.member || result);
    }

    Toast.success('团队成员已添加');
    renderTeam();

    if (els.teamForm) els.teamForm.reset();
    state.teamEditingId = null;
    loadTeamContribution();
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

    const team = state.bootstrap?.team || [];
    const member = team.find((m) => m.id === id);
    if (member) {
      Object.assign(member, result.item || result.member || updates);
    }

    Toast.success('团队成员已更新');
    state.teamEditingId = null;
    renderTeam();
    loadTeamContribution();
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
  const confirmed = await Dialog.confirm({
    title: '删除成员',
    message: '确定要删除这个团队成员吗？此操作不可恢复。',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    setPending(true);
    await requestJSON(`/api/team/${id}`, { method: 'DELETE' });

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

    [team[index], team[newIndex]] = [team[newIndex], team[index]];

    await requestJSON(`/api/team/${id}/order`, {
      method: 'PATCH',
      body: { orderIndex: newIndex + 1 },
    });

    Toast.success('位置已调整');
    renderTeam();
  } catch (error) {
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

  const form = els.teamForm;
  if (form.name) form.name.value = member.name || '';
  if (form.role) form.role.value = member.role || '';
  if (form.grade) form.grade.value = member.grade || '';
  if (form.major) form.major.value = member.major || '';
  if (form.studentId) form.studentId.value = member.studentId || '';
  if (form.groups) form.groups.value = normalizeGroups(member.groups).join(', ');
  if (form.partyJoinAt) form.partyJoinAt.value = member.partyJoinAt || '';
  if (form.skills) form.skills.value = member.skills || '';
  if (form.bio) form.bio.value = member.bio || '';
  if (form.email) form.email.value = member.email || '';
  if (form.phone) form.phone.value = member.phone || '';
  if (form.note) form.note.value = member.note || '';
  if (form.badge) form.badge.value = member.badge || '';
  if (form.status) form.status.value = member.status || 'active';
  if (form.joinedAt) form.joinedAt.value = member.joinedAt || '';
  if (els.teamFormId) els.teamFormId.value = id;

  if (els.teamFormSubmit) els.teamFormSubmit.textContent = '保存修改';
}

/**
 * 取消编辑团队成员
 */
export function cancelEditTeamMember() {
  state.teamEditingId = null;
  if (els.teamForm) els.teamForm.reset();
  if (els.teamFormId) els.teamFormId.value = '';
  if (els.teamFormSubmit) els.teamFormSubmit.textContent = '保存成员';
}

/**
 * 保存编辑的团队成员
 * @param {string} id - 成员 ID
 * @param {FormData} formData - 表单数据
 */
export async function saveEditTeamMember(id, formData) {
  const payload = formPayload(formData);

  if (!payload.name || !payload.role) {
    Toast.warning('请输入姓名和团队角色');
    return;
  }

  await updateTeamMember(id, payload);
}
