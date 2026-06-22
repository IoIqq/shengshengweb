/**
 * 调试日志门控
 *
 * 默认关闭，避免生产环境噪音。开启方式：
 *   localStorage.setItem('shengsheng.debug', '1')
 *   再刷新页面（或下次调用即生效）
 *
 * 关闭：localStorage.removeItem('shengsheng.debug')
 *
 * - log/info/debug/warn 受 flag 门控；error 直接转发不门控（错误总应可见）
 * - flag 缓存：每次调用读 localStorage 不贵，但通过事件 / 模块加载初始化场景下高频调用，
 *   仍把读取结果缓存到一个本地变量，并监听 storage 事件以跨标签页同步
 */

const FLAG_KEY = 'shengsheng.debug';

let enabled = false;
try {
  enabled = localStorage.getItem(FLAG_KEY) === '1';
} catch (e) { /* localStorage 不可用时按关闭处理 */ }

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === FLAG_KEY) enabled = event.newValue === '1';
  });
}

export function log(...args) { if (enabled) console.log(...args); }
export function info(...args) { if (enabled) console.info(...args); }
export function debug(...args) { if (enabled) console.debug(...args); }
export function warn(...args) { if (enabled) console.warn(...args); }
export function error(...args) { console.error(...args); }
export function isEnabled() { return enabled; }
