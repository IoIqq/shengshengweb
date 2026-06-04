/**
 * 模块化入口示例
 * 展示如何使用已提取的模块
 *
 * 使用方法：
 * 在 index.html 中添加：
 * <script type="module" src="js/app-modular-example.js"></script>
 */

import { Toast } from './ui/toast.js';
import { request, requestJSON } from './utils/api.js';
import { escapeHtml, formatDatetime, debounce } from './utils/helpers.js';

// 初始化 Toast
Toast.init();

// 示例：使用 Toast 显示通知
console.log('✅ 模块化系统已加载');
Toast.info('模块化系统已初始化');

// 示例：使用 API 模块
async function loadData() {
  try {
    const data = await request('/api/bootstrap');
    console.log('📦 数据加载成功:', data);
    Toast.success('数据加载成功');
  } catch (error) {
    console.error('❌ 数据加载失败:', error);
    Toast.error(error.message);
  }
}

// 示例：使用工具函数
function displayTime() {
  const now = new Date();
  const formatted = formatDatetime(now);
  console.log('🕐 当前时间:', formatted);
}

// 示例：防抖搜索
const debouncedSearch = debounce((query) => {
  console.log('🔍 搜索:', query);
  Toast.info(`搜索: ${query}`);
}, 500);

// 导出供其他模块使用
export { loadData, displayTime, debouncedSearch };

// 自动执行初始化
console.log('🚀 模块化应用启动');
displayTime();

// 测试按钮（如果存在）
document.addEventListener('DOMContentLoaded', () => {
  const testBtn = document.getElementById('test-modular');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      Toast.success('模块化测试成功！');
      loadData();
    });
  }
});
