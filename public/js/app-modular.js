/**
 * 模块化应用主入口（薄壳）
 *
 * 仅负责：Toast 初始化、全局错误/网络状态处理，并把启动编排委托给
 * core/bootstrap.js 的 init()。路由级动态加载见 core/module-loader.js，
 * 业务方法代理见 core/proxies.js，事件绑定见 core/events.js。
 */

import { Toast } from './ui/toast.js';
import { init } from './core/bootstrap.js';
import * as log from './utils/log.js';

// ============================================================================
// 全局初始化
// ============================================================================
log.log('🚀 模块化应用启动...');
Toast.init();

// 暴露到全局（向后兼容）
window.Toast = Toast;

// ============================================================================
// 全局错误处理
// ============================================================================

// 捕获未处理的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ 未处理的 Promise 错误:', event.reason);

  // 阻止默认的错误提示
  event.preventDefault();

  // 显示友好的错误提示
  const message = event.reason?.message || '发生了一个错误';
  Toast.error(message);

  // 如果是 401 错误，提示重新登录
  if (event.reason?.status === 401) {
    setTimeout(() => {
      if (confirm('登录已过期，是否重新登录？')) {
        window.location.reload();
      }
    }, 1000);
  }
});

// 捕获全局 JavaScript 错误
window.addEventListener('error', (event) => {
  console.error('❌ 全局错误:', event.error || event.message);

  // 阻止默认的错误提示
  event.preventDefault();

  // 只在开发环境显示详细错误
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    Toast.error(`错误: ${event.message}`);
  } else {
    Toast.error('应用遇到了一个问题，请刷新页面重试');
  }
});

// 监听网络状态变化
window.addEventListener('online', () => {
  log.log('✅ 网络已连接');
  Toast.success('网络已恢复');
});

window.addEventListener('offline', () => {
  log.log('⚠️ 网络已断开');
  Toast.warning('网络连接已断开，请检查网络');
});

// ============================================================================
// DOM 就绪后执行
// ============================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

log.log('✅ 模块化应用已加载');
