/**
 * 文件浏览模块 — 全盘文件管理器前端
 */
import { requestJSON, readCookie } from '../utils/api.js';
import { Toast } from '../ui/toast.js';

let currentPath = '';
let allServices = []; // unused but keeps pattern

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fileIcon(ext, isDir) {
  if (isDir) return '📁';
  const map = { jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼', mp4: '🎬', webm: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵', pdf: '📄', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊', zip: '🗜', rar: '🗜', '7z': '🗜', txt: '📃', md: '📃', json: '📃', js: '📃', css: '📃', html: '📃' };
  return map[ext] || '📄';
}

export async function renderFileBrowser() {
  try {
    const { drives = [] } = await requestJSON('/api/files/drives');
    renderSidebar(drives);
    if (drives.length > 0) {
      await loadFileList(drives[0].root);
    }
  } catch (error) {
    const list = document.getElementById('fb-list');
    if (list) list.innerHTML = `<p class="fb-empty">加载失败：${escapeHtml(error.message || '')}</p>`;
  }
}

function renderSidebar(drives) {
  const sidebar = document.getElementById('fb-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = drives.map((d) => {
    const cap = d.totalBytes ? `<span class="fb-drive-cap">${d.usedText || ''} / ${d.totalText || ''}</span><div class="fb-drive-bar"><div class="fb-drive-fill" style="width:${d.usedPercent || 0}%"></div></div>` : '';
    return `<button class="fb-drive-btn" data-root="${escapeHtml(d.root)}" type="button"><span class="fb-drive-label">${escapeHtml(d.label)}</span>${cap}</button>`;
  }).join('');
  sidebar.querySelectorAll('.fb-drive-btn').forEach((btn) => {
    btn.addEventListener('click', () => loadFileList(btn.dataset.root));
  });
}

export async function loadFileList(dirPath) {
  const list = document.getElementById('fb-list');
  const statusbar = document.getElementById('fb-statusbar');
  if (!list) return;
  if (!dirPath) return;
  list.innerHTML = '<p class="fb-empty">加载中…</p>';
  try {
    const { path: resolved, parent, items = [], truncated } = await requestJSON(`/api/files/list?path=${encodeURIComponent(dirPath)}`);
    currentPath = resolved;
    renderBreadcrumb(resolved, parent);
    if (items.length === 0) {
      list.innerHTML = '<p class="fb-empty">空文件夹</p>';
    } else {
      list.innerHTML = items.map((item) => renderItem(item)).join('');
      bindItemEvents();
    }
    if (statusbar) {
      const folders = items.filter((i) => i.isDir).length;
      const files = items.length - folders;
      statusbar.textContent = `${folders} 个文件夹 · ${files} 个文件${truncated ? '（已截断）' : ''}`;
    }
  } catch (error) {
    list.innerHTML = `<p class="fb-empty">加载失败：${escapeHtml(error.message || '')}</p>`;
  }
}

function renderBreadcrumb(resolved, parent) {
  const bc = document.getElementById('fb-breadcrumb');
  if (!bc) return;
  // 拆分路径为可点击段
  const sep = resolved.includes('/') ? '/' : '\\';
  const parts = resolved.split(/[/\\]/).filter(Boolean);
  let html = '';
  if (parent && parent !== resolved) {
    html += `<button class="fb-crumb fb-crumb-up" data-path="${escapeHtml(parent)}" type="button">↰ 上级</button><span class="fb-crumb-sep">/</span>`;
  }
  let acc = '';
  parts.forEach((part, idx) => {
    acc = acc ? acc + sep + part : part + sep;
    const isLast = idx === parts.length - 1;
    if (isLast) {
      html += `<span class="fb-crumb fb-crumb-current">${escapeHtml(part)}</span>`;
    } else {
      html += `<button class="fb-crumb" data-path="${escapeHtml(acc)}" type="button">${escapeHtml(part)}</button><span class="fb-crumb-sep">/</span>`;
    }
  });
  bc.innerHTML = html;
  bc.querySelectorAll('.fb-crumb[data-path]').forEach((btn) => {
    btn.addEventListener('click', () => loadFileList(btn.dataset.path));
  });
}

function renderItem(item) {
  const icon = fileIcon(item.ext, item.isDir);
  const date = item.mtime ? new Date(item.mtime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const actions = item.isDir
    ? `<button class="fb-item-action" data-action="open" data-path="${escapeHtml(item.path)}" title="打开">打开</button>`
    : `<button class="fb-item-action" data-action="download" data-path="${escapeHtml(item.path)}" title="下载">下载</button>`;
  return `<div class="fb-item${item.isDir ? ' is-dir' : ''}" role="listitem" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-isdir="${item.isDir}">
    <span class="fb-item-icon">${icon}</span>
    <span class="fb-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
    <span class="fb-item-size">${item.sizeText || ''}</span>
    <span class="fb-item-date">${date}</span>
    <span class="fb-item-actions">
      ${actions}
      <button class="fb-item-action" data-action="rename" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" title="重命名">重命名</button>
      <button class="fb-item-action fb-action-danger" data-action="delete" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" title="删除">删除</button>
    </span>
  </div>`;
}

function bindItemEvents() {
  const list = document.getElementById('fb-list');
  if (!list) return;
  list.querySelectorAll('.fb-item').forEach((row) => {
    // 双击文件夹打开
    row.addEventListener('dblclick', () => {
      if (row.dataset.isdir === 'true') loadFileList(row.dataset.path);
    });
    row.querySelectorAll('.fb-item-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const p = btn.dataset.path;
        if (action === 'open') loadFileList(p);
        else if (action === 'download') downloadFile(p);
        else if (action === 'rename') renameItem(p, btn.dataset.name);
        else if (action === 'delete') deleteItem(p, btn.dataset.name);
      });
    });
  });
}

async function downloadFile(p) {
  window.open(`/api/files/download?path=${encodeURIComponent(p)}`, '_blank');
}

async function renameItem(p, oldName) {
  const newName = prompt('输入新名称：', oldName);
  if (!newName || newName === oldName) return;
  const parent = p.replace(/[/\\][^/\\]+$/, '');
  const newPath = (parent.replace(/[/\\]$/, '')) + (p.includes('/') ? '/' : '\\') + newName;
  try {
    await requestJSON('/api/files/rename', { method: 'POST', body: { oldPath: p, newPath }, retry: false });
    Toast.show('已重命名', 'success');
    loadFileList(currentPath);
  } catch (error) {
    Toast.show(error.message || '重命名失败', 'error');
  }
}

async function deleteItem(p, name) {
  if (!confirm(`确定删除「${name}」？\n文件夹将被递归删除，不可恢复。`)) return;
  try {
    await requestJSON(`/api/files?path=${encodeURIComponent(p)}`, { method: 'DELETE', retry: false });
    Toast.show('已删除', 'success');
    loadFileList(currentPath);
  } catch (error) {
    Toast.show(error.message || '删除失败', 'error');
  }
}

async function mkdir() {
  const name = prompt('输入文件夹名称：');
  if (!name) return;
  try {
    await requestJSON('/api/files/mkdir', { method: 'POST', body: { path: currentPath, name }, retry: false });
    Toast.show('已创建', 'success');
    loadFileList(currentPath);
  } catch (error) {
    Toast.show(error.message || '创建失败', 'error');
  }
}

async function uploadFiles(files) {
  if (!files || files.length === 0) return;
  const formData = new FormData();
  formData.append('path', currentPath);
  for (const f of files) formData.append('files', f);
  const csrfToken = readCookie('ss_csrf');
  try {
    Toast.show(`正在上传 ${files.length} 个文件…`, 'info');
    const resp = await fetch('/api/files/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '上传失败');
    Toast.show(`已上传 ${data.files?.length || 0} 个文件`, 'success');
    loadFileList(currentPath);
  } catch (error) {
    Toast.show(error.message || '上传失败', 'error');
  }
}

export function bindFileBrowserEvents() {
  const refreshBtn = document.getElementById('fb-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => { if (currentPath) loadFileList(currentPath); });

  const mkdirBtn = document.getElementById('fb-mkdir-btn');
  if (mkdirBtn) mkdirBtn.addEventListener('click', mkdir);

  const uploadInput = document.getElementById('fb-upload-input');
  if (uploadInput) {
    uploadInput.addEventListener('change', (e) => {
      if (e.target.files?.length) uploadFiles(Array.from(e.target.files));
      e.target.value = '';
    });
  }

  // 拖拽上传
  const dropZone = document.getElementById('fb-drop-zone');
  const main = document.querySelector('.fb-main');
  if (main && dropZone) {
    let dragCounter = 0;
    main.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropZone.hidden = false; });
    main.addEventListener('dragleave', () => { dragCounter--; if (dragCounter <= 0) { dropZone.hidden = true; dragCounter = 0; } });
    main.addEventListener('dragover', (e) => e.preventDefault());
    main.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropZone.hidden = true;
      if (e.dataTransfer?.files?.length) uploadFiles(Array.from(e.dataTransfer.files));
    });
  }
}
