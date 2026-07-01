/**
 * 面板模板异步加载模块
 *
 * 工作台的各业务面板（workspace-panel）以纯 HTML 片段形式存放于
 * public/templates/*.html，登录成功后由 mountPanels() 一次性挂载到
 * 工作台壳的 <section class="workspace-grid"> 占位节点中。
 *
 * 设计目标：
 * - index.html 只保留外壳，首屏体积大幅缩小
 * - 面板 HTML 与入口逻辑解耦，单文件更易维护
 * - 浏览器原生缓存 + 内存 Map 双重兜底，重复挂载零额外网络开销
 */

import { Toast } from '../ui/toast.js';

// 面板挂载顺序（与导航 data-view 顺序一致）；值为 templates/<file>.html 文件名
const PANELS = [
  'overview',
  'media-library',
  'review',
  'todo',
  'device',
  'borrow',
  'team',
  'topics',
  'settings',
  'file-browser',
  'monitor',
  'services',
  'host',
];

// 模板片段内存缓存：file -> html 字符串
const cache = new Map();

let mounted = false;

/**
 * 加载单个面板模板片段
 * @param {string} name - 模板文件名（不含扩展名），如 'overview'
 * @returns {Promise<string>} 模板 HTML 字符串
 */
export async function loadPanelTemplate(name) {
  if (cache.has(name)) return cache.get(name);

  const response = await fetch(`templates/${name}.html`, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`模板 ${name} 加载失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  cache.set(name, html);
  return html;
}

/**
 * 一次性挂载所有工作台面板模板
 *
 * 幂等：重复调用直接跳过；单个模板失败不影响其余面板，并通过 Toast 友好提示。
 * @param {HTMLElement} [targetEl] - 挂载容器，默认 .workspace-grid
 * @returns {Promise<boolean>} 是否全部挂载成功
 */
export async function mountPanels(targetEl) {
  if (mounted) return true;

  const target = targetEl || document.querySelector('.workspace-grid');
  if (!target) {
    console.error('❌ 未找到面板挂载容器 .workspace-grid');
    return false;
  }

  const results = await Promise.all(
    PANELS.map(async (name) => {
      try {
        const html = await loadPanelTemplate(name);
        return { name, html };
      } catch (error) {
        console.error(`❌ 面板模板加载失败: ${name}`, error);
        return { name, html: null };
      }
    })
  );

  // 按声明顺序拼接，保证 DOM 中面板顺序稳定
  const fragmentHtml = results
    .filter((r) => r.html)
    .map((r) => r.html)
    .join('\n');

  target.insertAdjacentHTML('beforeend', fragmentHtml);

  const failed = results.filter((r) => !r.html).map((r) => r.name);
  if (failed.length) {
    Toast.error(`部分面板加载失败（${failed.join('、')}），请刷新重试`);
    return false;
  }

  mounted = true;
  return true;
}
