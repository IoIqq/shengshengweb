/**
 * 系统管理面板模块
 *
 * 仅管理员可访问。展示服务器运行状态、数据库信息、网络访问地址和二维码、
 * 最近日志等运维数据。所有操作均为只读（不控制服务器生命周期）。
 */

import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

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
    setText('sys-mem-rss', `${info.memory.rss} MB`);
    setText('sys-mem-heap', `${info.memory.heapUsed} / ${info.memory.heapTotal} MB`);

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
 * 加载并显示最近日志
 */
export async function loadSystemLogs() {
  const viewer = document.getElementById('sys-log-viewer');
  if (!viewer) return;

  viewer.textContent = '加载中…';

  try {
    const data = await requestJSON('/api/system/logs?lines=50');
    const fileEl = document.getElementById('sys-log-file');
    if (fileEl) fileEl.textContent = data.file;

    if (data.lines.length === 0) {
      viewer.textContent = data.message || '暂无日志记录。';
    } else {
      viewer.textContent = data.lines.join('\n');
      viewer.scrollTop = viewer.scrollHeight;
    }
  } catch (error) {
    console.error('获取日志失败:', error);
    viewer.textContent = '加载日志失败: ' + (error.message || '未知错误');
  }
}

/** 辅助：安全设置文本内容 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}