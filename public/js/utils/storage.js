/**
 * 客户端存储工具 - 支持自动过期的 localStorage 包装
 *
 * 使用场景：
 * - 缓存媒体列表、团队信息等不经常变化的数据
 * - 自动过期机制避免数据陈旧
 */

export const storage = {
  /**
   * 存储数据
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {number} ttl - 过期时间（毫秒），默认 1 小时
   */
  set(key, value, ttl = 3600000) {
    try {
      const data = {
        value,
        expires: Date.now() + ttl,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.warn('❌ localStorage 存储失败（可能容量满）:', err);
    }
  },

  /**
   * 获取数据
   * @param {string} key - 存储键
   * @returns {any|null} 存储的值，或 null 如果不存在/已过期
   */
  get(key) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const data = JSON.parse(item);
      if (!data || typeof data.expires !== 'number') {
        return null;
      }

      // 检查过期时间
      if (Date.now() > data.expires) {
        localStorage.removeItem(key);
        return null;
      }

      return data.value;
    } catch (err) {
      console.warn('❌ localStorage 读取失败:', err);
      return null;
    }
  },

  /**
   * 检查数据是否存在且未过期
   * @param {string} key - 存储键
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  },

  /**
   * 删除数据
   * @param {string} key - 存储键
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('❌ localStorage 删除失败:', err);
    }
  },

  /**
   * 清空所有数据
   */
  clear() {
    try {
      localStorage.clear();
    } catch (err) {
      console.warn('❌ localStorage 清空失败:', err);
    }
  },

  /**
   * 获取存储使用情况
   * @returns {object} { used: 字节数, quota: 字节数, percentage: 0-100 }
   */
  async getQuota() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage,
          quota: estimate.quota,
          percentage: Math.round((estimate.usage / estimate.quota) * 100),
        };
      }
    } catch (err) {
      console.warn('❌ 无法获取存储配额:', err);
    }
    return null;
  },

  /**
   * 清理过期数据
   * @returns {number} 清理的项数
   */
  cleanup() {
    let count = 0;
    const now = Date.now();

    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;

        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data?.expires && now > data.expires) {
            localStorage.removeItem(key);
            count++;
          }
        } catch {
          // 忽略无法解析的项
        }
      }
    } catch (err) {
      console.warn('❌ 清理过期数据失败:', err);
    }

    return count;
  },
};

/**
 * 会话存储 - 仅在当前标签页有效
 */
export const sessionCache = {
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('❌ sessionStorage 存储失败:', err);
    }
  },

  get(key) {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (err) {
      console.warn('❌ sessionStorage 读取失败:', err);
      return null;
    }
  },

  remove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (err) {
      console.warn('❌ sessionStorage 删除失败:', err);
    }
  },

  clear() {
    try {
      sessionStorage.clear();
    } catch (err) {
      console.warn('❌ sessionStorage 清空失败:', err);
    }
  },
};

// 定期清理过期数据（每小时）
if (typeof window !== 'undefined') {
  setInterval(() => {
    const cleaned = storage.cleanup();
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期缓存项`);
    }
  }, 3600000);
}
