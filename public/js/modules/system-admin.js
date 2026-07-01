/**
 * 运维模块（网络访问 / 日志 / 飞书同步）
 *
 * 仅管理员可访问，元素挂在「系统设置 → 运维」标签页内。
 * 展示局域网访问地址+二维码、服务器日志、飞书多维表格同步状态。均为只读运维数据。
 */

import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * 加载并渲染网络信息 + 二维码
 */
export async function loadNetworkInfo() {
  try {
    const net = await requestJSON('/api/system/network');

    // LAN 地址列表
    const listEl = document.getElementById('sys-lan-list');
    if (listEl) {
      if (!net.lanAddresses || net.lanAddresses.length === 0) {
        listEl.innerHTML = '<li class="sys-lan-placeholder">未检测到局域网地址</li>';
      } else {
        listEl.innerHTML = net.lanAddresses.map((a) => {
          const name = escapeHtml(a.name || '');
          const addr = escapeHtml(a.address || '');
          const port = escapeHtml(String(net.port));
          const copyVal = escapeHtml(`${a.address || ''}:${net.port}`);
          return `<li><span class="sys-lan-iface">${name}</span> <code>${addr}:${port}</code> <button class="btn btn-xs btn-outline sys-copy-btn" data-copy="${copyVal}" title="复制地址">📋</button></li>`;
        }).join('');
        // 绑定复制按钮
        listEl.querySelectorAll('.sys-copy-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const text = btn.dataset.copy;
            navigator.clipboard.writeText(text).then(() => {
              Toast.success('已复制: ' + text);
            }).catch(() => {
              Toast.error('复制失败');
            });
          });
        });
      }
    }

    // 二维码
    const qrWrap = document.getElementById('sys-qr-wrap');
    if (qrWrap && net.qrSvg) {
      qrWrap.innerHTML = net.qrSvg;
    }

    // URL 提示
    const urlEl = document.getElementById('sys-qr-url');
    if (urlEl) {
      urlEl.textContent = '扫码访问: ' + net.primaryUrl;
    }

  } catch (error) {
    console.error('获取网络信息失败:', error);
    Toast.error('获取网络信息失败');
  }
}

/**
 * 加载飞书同步状态并渲染卡片
 */
export async function loadFeishuSyncStatus() {
  try {
    const st = await requestJSON('/api/feishu-sync/status');

    const badge = document.getElementById('sys-feishu-badge');
    if (badge) {
      const enabled = !!st.enabled;
      badge.textContent = enabled ? '已启用' : '未启用';
      badge.dataset.state = enabled ? 'ok' : 'idle';
    }

    const runBtn = document.getElementById('sys-feishu-run-btn');
    if (runBtn) runBtn.disabled = !st.enabled;

    const msg = document.getElementById('sys-feishu-msg');
    if (msg) {
      const last = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString('zh-CN') : '从未同步';
      msg.textContent = `${last} · ${st.message || ''}`;
    }

    const statsEl = document.getElementById('sys-feishu-stats');
    if (statsEl) {
      const s = st.stats || {};
      const items = [
        ['已导入待回写', s.synced ?? 0],
        ['已回写审批', s.backed ?? 0],
        ['匹配异常', s.errored ?? 0],
      ];
      statsEl.innerHTML = items.map(([k, v]) => `<li><span class="sys-feishu-stat-k">${escapeHtml(k)}</span><span class="sys-feishu-stat-v">${v}</span></li>`).join('');
      statsEl.hidden = false;
    }

    // 有异常则拉取异常列表
    const hint = document.getElementById('sys-feishu-errors-hint');
    const list = document.getElementById('sys-feishu-errors');
    if (hint && list) {
      if ((st.stats?.errored ?? 0) > 0) {
        hint.hidden = false;
        list.hidden = false;
        try {
          const data = await requestJSON('/api/feishu-sync/errors');
          list.innerHTML = (data.errors || []).map((e) =>
            `<li><code>${escapeHtml(e.recordId || '')}</code> <span class="sys-feishu-err">${escapeHtml(e.error || '')}</span></li>`,
          ).join('') || '<li class="sys-feishu-placeholder">无</li>';
        } catch (_) {
          list.innerHTML = '<li class="sys-feishu-placeholder">异常列表加载失败</li>';
        }
      } else {
        hint.hidden = true;
        list.hidden = true;
      }
    }
  } catch (error) {
    const msg = document.getElementById('sys-feishu-msg');
    if (msg) msg.textContent = '飞书同步状态加载失败（可能未配置）';
    const runBtn = document.getElementById('sys-feishu-run-btn');
    if (runBtn) runBtn.disabled = true;
  }
}

/**
 * 手动触发一次飞书同步
 */
export async function runFeishuSync() {
  const btn = document.getElementById('sys-feishu-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 同步中...'; }
  try {
    const result = await requestJSON('/api/feishu-sync/run', { method: 'POST', retry: false });
    Toast.success(result.message || '同步完成');
    await loadFeishuSyncStatus();
  } catch (error) {
    Toast.error(error.message || '同步失败');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 立即同步'; }
  }
}

/**
 * 渲染日志行为着色
 * @param {string[]} lines - 日志行
 * @returns {string} HTML 内容
 */
function renderLogLines(lines) {
  return lines.map(line => {
    const lower = line.toLowerCase();
    if (lower.includes('[error]') || lower.includes('err!') || lower.includes('error:')) {
      return `<span class="sys-log-line sys-log-line--error">${escapeHtml(line)}</span>`;
    }
    if (lower.includes('[warn]') || lower.includes('warning:') || lower.includes('warn:')) {
      return `<span class="sys-log-line sys-log-line--warn">${escapeHtml(line)}</span>`;
    }
    if (lower.includes('[debug]') || lower.includes('debug:')) {
      return `<span class="sys-log-line sys-log-line--debug">${escapeHtml(line)}</span>`;
    }
    return `<span class="sys-log-line sys-log-line--info">${escapeHtml(line)}</span>`;
  }).join('\n');
}

/**
 * 加载并渲染日志
 * @param {string} [date] - 日期 YYYY-MM-DD，默认今天
 * @param {number} [lines] - 行数，默认 200
 */
export async function loadSystemLogs(date, lines = 200) {
  const viewer = document.getElementById('sys-log-viewer');
  if (!viewer) return;

  viewer.textContent = '加载中…';

  try {
    const params = new URLSearchParams({ lines: String(lines) });
    if (date) params.set('date', date);

    const data = await requestJSON(`/api/system/logs?${params}`);
    const fileEl = document.getElementById('sys-log-file');
    if (fileEl) fileEl.textContent = data.file;

    // 存储原始日志内容用于搜索
    viewer.dataset.rawContent = data.lines.join('\n');

    if (data.lines.length === 0) {
      viewer.innerHTML = `<span class="sys-log-line sys-log-line--info">${escapeHtml(data.message || '暂无日志记录。')}</span>`;
    } else {
      viewer.innerHTML = renderLogLines(data.lines);
      viewer.scrollTop = viewer.scrollHeight;
    }

    // 显示"加载全部"按钮（如果总行数超过已加载行数）
    const loadAllBtn = document.getElementById('sys-load-all-logs-btn');
    if (loadAllBtn) {
      if (data.totalLines > lines) {
        loadAllBtn.hidden = false;
        loadAllBtn.textContent = ` 加载全部 (${data.totalLines} 行)`;
      } else {
        loadAllBtn.hidden = true;
      }
    }

    // 显示搜索按钮
    const searchBtn = document.getElementById('sys-log-search-btn');
    if (searchBtn) searchBtn.hidden = false;

    return data;
  } catch (error) {
    console.error('获取日志失败:', error);
    viewer.innerHTML = `<span class="sys-log-line sys-log-line--error">${escapeHtml('加载日志失败: ' + (error.message || '未知错误'))}</span>`;
  }
}

/**
 * 加载可用日志文件列表
 */
export async function loadLogFileList() {
  const select = document.getElementById('sys-log-file-list');
  if (!select) return;

  try {
    const data = await requestJSON('/api/system/logs/list');
    const files = data.files || [];

    select.innerHTML = files.length === 0
      ? '<option value="">无日志文件</option>'
      : files.map(f => `<option value="${f.date}">${f.date} (${f.filename})</option>`).join('');

    // 绑定选择事件
    select.onchange = () => {
      const date = select.value;
      if (date) loadSystemLogs(date);
    };
  } catch (error) {
    console.error('获取日志列表失败:', error);
    select.innerHTML = '<option value="">加载失败</option>';
  }
}

/**
 * 在日志中搜索
 */
export function searchLogs(keyword) {
  const viewer = document.getElementById('sys-log-viewer');
  const countEl = document.getElementById('sys-log-search-count');
  if (!viewer || !countEl) return;

  const rawContent = viewer.dataset.rawContent || '';
  if (!rawContent) return;

  if (!keyword || keyword.trim() === '') {
    viewer.innerHTML = renderLogLines(rawContent.split('\n'));
    countEl.textContent = '';
    return;
  }

  const lines = rawContent.split('\n');
  const matchedLines = lines.filter(line =>
    line.toLowerCase().includes(keyword.toLowerCase())
  );

  if (matchedLines.length === 0) {
    viewer.innerHTML = `<span class="sys-log-line sys-log-line--info">${escapeHtml('未找到匹配内容')}</span>`;
  } else {
    viewer.innerHTML = renderLogLines(matchedLines);
  }

  countEl.textContent = `${matchedLines.length} / ${lines.length} 行`;
}