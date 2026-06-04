/**
 * 性能监控工具 - 测量关键性能指标
 *
 * 指标说明：
 * - FCP (First Contentful Paint): 首次内容绘制
 * - LCP (Largest Contentful Paint): 最大内容绘制
 * - CLS (Cumulative Layout Shift): 累积布局偏移
 * - TTFB (Time to First Byte): 首字节时间
 * - FID (First Input Delay): 首次输入延迟
 */
/* global PerformanceObserver */

export const performance = {
  /**
   * 获取导航性能指标
   * @returns {object} 导航定时数据
   */
  getNavigationMetrics() {
    if (!window.performance?.getEntriesByType) {
      return null;
    }

    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return null;

    return {
      // DNS 查询耗时
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      // TCP 连接耗时
      tcp: nav.connectEnd - nav.connectStart,
      // 首字节耗时
      ttfb: nav.responseStart - nav.requestStart,
      // 响应完成耗时
      response: nav.responseEnd - nav.responseStart,
      // DOM 解析耗时
      domParse: nav.domInteractive - nav.domLoading,
      // DOM 完成耗时（包括脚本执行）
      domComplete: nav.domContentLoadedEventEnd - nav.domLoading,
      // 页面完全加载耗时
      pageLoad: nav.loadEventEnd - nav.loadEventStart,
      // 总加载时间
      total: nav.loadEventEnd - nav.fetchStart,
    };
  },

  /**
   * 获取绘制性能指标
   * @returns {object} FCP 和 LCP 数据
   */
  getPaintMetrics() {
    if (!window.performance?.getEntriesByType) {
      return null;
    }

    const paint = performance.getEntriesByType('paint');
    const result = {};

    paint.forEach((p) => {
      result[p.name] = p.startTime; // FCP, LCP 等
    });

    return result;
  },

  /**
   * 观测 Largest Contentful Paint (LCP)
   * @param {Function} callback - 回调函数 (metrics) => void
   */
  observeLCP(callback) {
    if (!window.PerformanceObserver) {
      console.warn('⚠️ PerformanceObserver 不支持');
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        callback({
          name: 'LCP',
          value: lastEntry.renderTime || lastEntry.loadTime,
          element: lastEntry.element?.tagName || 'unknown',
          url: lastEntry.url,
        });
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      return observer;
    } catch (err) {
      console.warn('❌ LCP 观测失败:', err);
    }
  },

  /**
   * 观测 Cumulative Layout Shift (CLS)
   * @param {Function} callback - 回调函数 (metrics) => void
   */
  observeCLS(callback) {
    if (!window.PerformanceObserver) {
      console.warn('⚠️ PerformanceObserver 不支持');
      return;
    }

    try {
      let cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            cls += entry.value;
            callback({
              name: 'CLS',
              value: cls,
              entries: entry,
            });
          }
        }
      });

      observer.observe({ entryTypes: ['layout-shift'] });
      return observer;
    } catch (err) {
      console.warn('❌ CLS 观测失败:', err);
    }
  },

  /**
   * 观测 First Input Delay (FID)
   * @param {Function} callback - 回调函数 (metrics) => void
   */
  observeFID(callback) {
    if (!window.PerformanceObserver) {
      console.warn('⚠️ PerformanceObserver 不支持');
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          callback({
            name: 'FID',
            value: entry.processingStart - entry.startTime,
            eventName: entry.name,
          });
        });
      });

      observer.observe({ entryTypes: ['first-input'] });
      return observer;
    } catch (err) {
      console.warn('❌ FID 观测失败:', err);
    }
  },

  /**
   * 测量自定义事件耗时
   * @param {string} name - 事件名称
   * @param {Function} fn - 执行函数
   * @returns {object} { duration: 毫秒, result: 函数返回值 }
   */
  measure(name, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);

    return { duration, result };
  },

  /**
   * 生成完整性能报告
   */
  generateReport() {
    const nav = this.getNavigationMetrics();
    const paint = this.getPaintMetrics();

    console.group('📊 性能报告');
    console.log('=== 导航定时 ===');
    nav && Object.entries(nav).forEach(([key, value]) => {
      console.log(`${key}: ${value.toFixed(2)}ms`);
    });

    console.log('\n=== 绘制指标 ===');
    paint && Object.entries(paint).forEach(([key, value]) => {
      console.log(`${key}: ${value.toFixed(2)}ms`);
    });

    console.groupEnd();

    return { nav, paint };
  },

  /**
   * 获取资源加载时间
   * @param {string} type - 资源类型（script, link, img, xhr 等），不指定则返回全部
   * @returns {array} 资源列表
   */
  getResourceMetrics(type) {
    if (!window.performance?.getEntriesByType) {
      return [];
    }

    const resources = performance.getEntriesByType('resource');
    if (!type) return resources;

    return resources.filter((r) => r.initiatorType === type);
  },

  /**
   * 报告 Web Vitals（Core Web Vitals）
   */
  reportWebVitals(callback) {
    try {
      // LCP
      this.observeLCP((metrics) => {
        if (metrics.value > 0) {
          callback({ ...metrics, status: metrics.value > 2500 ? '❌ 差' : '✅ 好' });
        }
      });

      // CLS
      this.observeCLS((metrics) => {
        callback({ ...metrics, status: metrics.value > 0.1 ? '❌ 差' : '✅ 好' });
      });

      // FID
      this.observeFID((metrics) => {
        callback({ ...metrics, status: metrics.value > 100 ? '❌ 差' : '✅ 好' });
      });
    } catch (err) {
      console.error('❌ Web Vitals 报告失败:', err);
    }
  },
};

// 页面卸载时输出完整性能报告
if (typeof window !== 'undefined') {
  // 延迟输出，避免影响页面加载
  window.addEventListener('load', () => {
    setTimeout(() => {
      performance.generateReport();
    }, 0);
  });
}
