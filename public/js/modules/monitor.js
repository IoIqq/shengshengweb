/**
 * 资源监控模块 — 磁盘/资源实时仪表 + Canvas 折线图
 */
import { requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

let refreshTimer = null;

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderMonitor() {
  await Promise.all([refreshResources(), refreshDisks(), refreshHistory()]);
  startAutoRefresh();
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(async () => {
    // 仅在监控面板激活时刷新；离开后静默跳过（不停止定时器，切回即可恢复），
    // 避免后台持续打 API，又不至于切走后定时器被杀、切回不再刷新。
    const panel = document.querySelector('.workspace-panel[data-panel="monitor"]');
    if (!panel || !panel.classList.contains('active')) return;
    await refreshResources();
    await refreshHistory();
  }, 5000);
  if (refreshTimer.unref) refreshTimer.unref();
}

function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

export async function refreshResources() {
  try {
    const r = await requestJSON('/api/monitor/resources');
    const cpuFill = document.getElementById('mon-cpu-fill');
    const cpuVal = document.getElementById('mon-cpu-value');
    const cpuSub = document.getElementById('mon-cpu-sub');
    if (cpuFill) { cpuFill.style.width = r.cpu.usage + '%'; cpuFill.className = 'mon-gauge-fill' + (r.cpu.usage > 80 ? ' is-danger' : r.cpu.usage > 60 ? ' is-warn' : ''); }
    if (cpuVal) cpuVal.textContent = r.cpu.usage + ' %';
    if (cpuSub) cpuSub.textContent = `${r.cpu.cores} 核心 · ${r.cpu.model || ''}`;

    const memFill = document.getElementById('mon-mem-fill');
    const memVal = document.getElementById('mon-mem-value');
    const memSub = document.getElementById('mon-mem-sub');
    if (memFill) { memFill.style.width = r.memory.usedPercent + '%'; memFill.className = 'mon-gauge-fill' + (r.memory.usedPercent > 85 ? ' is-danger' : r.memory.usedPercent > 70 ? ' is-warn' : ''); }
    if (memVal) memVal.textContent = r.memory.usedPercent + ' %';
    if (memSub) memSub.textContent = `${r.memory.usedText} / ${r.memory.totalText}`;

    const sys = document.getElementById('mon-sysinfo');
    if (sys) {
      const upH = Math.floor(r.uptime / 3600);
      const upM = Math.floor((r.uptime % 3600) / 60);
      sys.innerHTML = `主机: <strong>${escapeHtml(r.hostname)}</strong>　|　运行时间: ${upH}小时${upM}分　|　平台: ${escapeHtml(r.platform)}　|　进程内存: ${r.process.rss}`;
    }
  } catch (error) {
    /* 静默，避免 5s 轮询刷屏 */
  }
}

export async function refreshDisks() {
  try {
    const { disks = [], volumes = [] } = await requestJSON('/api/monitor/disks');
    const disksEl = document.getElementById('mon-disks');
    if (disksEl) {
      disksEl.innerHTML = disks.length === 0
        ? '<p class="fb-empty">无法获取物理磁盘信息（wmic 不可用）</p>'
        : disks.map((d) => `<div class="mon-disk-card">
            <p class="mon-disk-model">${escapeHtml(d.model)}</p>
            <p class="mon-disk-meta">序列号: ${escapeHtml(d.serial || '—')} · 状态: <span class="mon-disk-status ${d.status === 'OK' ? 'is-ok' : 'is-warn'}">${escapeHtml(d.status || '—')}</span></p>
            <p class="mon-disk-meta">${d.sizeText || '—'} · ${escapeHtml(d.mediaType || '')}</p>
          </div>`).join('');
    }
    const volEl = document.getElementById('mon-volumes');
    if (volEl) {
      volEl.innerHTML = volumes.length === 0
        ? '<p class="fb-empty">无可用盘符</p>'
        : volumes.map((v) => `<div class="mon-volume-card">
            <p class="mon-volume-root">${escapeHtml(v.root)}</p>
            <div class="mon-volume-bar"><div class="mon-volume-fill ${(v.usedPercent || 0) > 85 ? 'is-danger' : (v.usedPercent || 0) > 70 ? 'is-warn' : ''}" style="width:${v.usedPercent}%"></div></div>
            <p class="mon-volume-meta">${v.usedText} / ${v.totalText} (${v.usedPercent}%) · 可用 ${v.freeText}</p>
          </div>`).join('');
    }
  } catch (error) {
    Toast.show('获取磁盘信息失败', 'error');
  }
}

export async function refreshHistory() {
  try {
    const { cpu = [], mem = [], timestamps = [] } = await requestJSON('/api/monitor/history');
    drawLineChart('mon-cpu-chart', cpu, timestamps, '#6a7066', 100);
    drawLineChart('mon-mem-chart', mem, timestamps, '#3a7d44', 100);
  } catch (_) {}
}

/**
 * 轻量 Canvas 折线图：自绘坐标轴/网格/曲线，零依赖
 */
function drawLineChart(canvasId, values, timestamps, color, yMax) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  // 背景网格
  ctx.strokeStyle = 'rgba(128,128,128,0.15)';
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(128,128,128,0.7)';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    const label = Math.round(yMax - (yMax / 4) * i);
    ctx.fillText(label + '%', 4, y + 3);
  }

  if (values.length < 2) {
    ctx.fillStyle = 'rgba(128,128,128,0.5)';
    ctx.fillText('数据不足', w / 2 - 20, h / 2);
    return;
  }

  // 曲线
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const step = cw / Math.max(1, values.length - 1);
  values.forEach((v, i) => {
    const x = pad.l + step * i;
    const y = pad.t + ch - (Math.min(v, yMax) / yMax) * ch;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 填充
  ctx.lineTo(pad.l + step * (values.length - 1), pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
}

export function bindMonitorEvents() {
  const btn = document.getElementById('mon-refresh-btn');
  if (btn) btn.addEventListener('click', () => { refreshResources(); refreshDisks(); refreshHistory(); });
}
