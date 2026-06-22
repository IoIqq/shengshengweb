/**
 * 系统管理面板模块
 *
 * 仅管理员可访问。展示服务器运行状态、数据库信息、网络访问地址和二维码、
 * 最近日志等运维数据。所有操作均为只读（不控制服务器生命周期）。
 */

import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * 格式化秒数为可读时间
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}天`);
  if (h > 0) parts.push(`${h}时`);
  if (m > 0) parts.push(`${m}分`);
  parts.push(`${s}秒`);
  return parts.join(' ');
}

/**
 * 格式化字节
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 渲染系统管理面板（进入视图时调用）
 */
export async function renderSystemPanel() {
  await refreshSystemInfo();
  await loadNetworkInfo();
}

/**
 * 刷新系统信息并更新服务器状态卡和数据库卡
 */
export async function refreshSystemInfo() {
  try {
    const info = await requestJSON('/api/system/info');

    // 服务器状态
    setText('sys-node-version', info.nodeVersion);
    setText('sys-platform', info.platform);
    setText('sys-hostname', info.hostname);
    setText('sys-cpu-cores', String(info.cpuCores));
    setText('sys-uptime', formatUptime(info.uptime));
    setText('sys-port', String(info.port));

    // 内存使用进度条
    const memText = document.getElementById('sys-mem-text');
    const memBar = document.getElementById('sys-mem-bar');
    if (memText && memBar && info.totalMemory > 0) {
      const memPercent = Math.min(100, Math.round((info.memory.rss / info.totalMemory) * 100));
      memText.textContent = `${info.memory.rss} MB / ${info.totalMemory} MB (${memPercent}%)`;
      memBar.style.width = `${memPercent}%`;
    }

    // CPU 使用率进度条
    const cpuText = document.getElementById('sys-cpu-text');
    const cpuBar = document.getElementById('sys-cpu-bar');
    if (cpuText && cpuBar) {
      const cpuPercent = info.cpuUsage || 0;
      cpuText.textContent = `${cpuPercent}%`;
      cpuBar.style.width = `${cpuPercent}%`;
    }

    // PM2 状态
    const pm2El = document.getElementById('sys-pm2');
    if (pm2El) {
      if (info.pm2.isPM2) {
        pm2El.innerHTML = `<span class="sys-badge sys-badge-ok">PM2 #${info.pm2.id || '?'}</span>`;
      } else {
        pm2El.innerHTML = '<span class="sys-badge sys-badge-dim">独立运行</span>';
      }
    }

    // 数据库
    setText('sys-db-path', info.database.path);
    setText('sys-db-size', formatBytes(info.database.sizeBytes));
    const dbExistsEl = document.getElementById('sys-db-exists');
    if (dbExistsEl) {
      dbExistsEl.innerHTML = info.database.exists
        ? '<span class="sys-badge sys-badge-ok">正常</span>'
        : '<span class="sys-badge sys-badge-err">不存在</span>';
    }
    setText('sys-upload-count', String(info.uploadDir.fileCount));

    // 堆内存
    setText('sys-mem-heap', `${info.memory.heapUsed} / ${info.memory.heapTotal} MB`);

  } catch (error) {
    console.error('获取系统信息失败:', error);
    Toast.error('获取系统信息失败');
  }
}

/**
 * 加载并渲染网络信息 + 二维码
 */
export async function loadNetworkInfo() {
  try {
    const net = await requestJSON('/api/system/network');

    // LAN 地址列表
    const listEl = document.getElementById('sys-lan-list');
    if (listEl) {
      if (net.lanAddresses.length === 0) {
        listEl.innerHTML = '<li class="sys-lan-placeholder">未检测到局域网地址</li>';
      } else {
        listEl.innerHTML = net.lanAddresses.map((a) =>
          `<li><span class="sys-lan-iface">${a.name}</span> <code>${a.address}:${net.port}</code> <button class="btn btn-xs btn-outline sys-copy-btn" data-copy="${a.address}:${net.port}" title="复制地址">📋</button></li>`
        ).join('');
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

/** 辅助：安全设置文本内容 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * 重启服务
 */
export async function restartService() {
  const btn = document.getElementById('sys-restart-btn');
  if (!btn) return;

  // 15 秒冷却期
  if (btn.disabled || btn.classList.contains('is-cooling')) {
    Toast.warning('重启冷却中，请稍后再试');
    return;
  }

  const confirmed = confirm('确认要重启服务吗？\n\n重启期间服务将短暂不可用（约 3-5 秒）。');
  if (!confirmed) return;

  try {
    btn.disabled = true;
    btn.classList.add('is-cooling');
    btn.textContent = '⏳ 重启中...';

    const result = await requestJSON('/api/system/restart', { method: 'POST' });

    Toast.success('服务将在 2 秒后重启，页面将自动刷新');

    // 15 秒冷却
    let cooldown = 15;
    btn.textContent = `冷却中 (${cooldown}s)`;

    const cooldownInterval = setInterval(() => {
      cooldown--;
      if (cooldown <= 0) {
        clearInterval(cooldownInterval);
        btn.disabled = false;
        btn.classList.remove('is-cooling');
        btn.textContent = '⚠ 重启服务';
      } else {
        btn.textContent = `冷却中 (${cooldown}s)`;
      }
    }, 1000);

    // 3 秒后自动刷新页面
    setTimeout(() => {
      window.location.reload();
    }, 3000);

  } catch (error) {
    console.error('重启失败:', error);
    Toast.error(error.message || '重启失败');
    btn.disabled = false;
    btn.classList.remove('is-cooling');
    btn.textContent = '⚠ 重启服务';
  }
}