/**
 * API 请求模块
 * 封装所有 HTTP 请求逻辑，包含错误处理、重试和超时控制
 */

// 配置
const API_CONFIG = {
  timeout: 30000, // 30秒超时
  retryAttempts: 2, // 重试次数
  retryDelay: 1000, // 重试延迟（毫秒）
};

// 读取 Cookie
export function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * 创建带超时的 fetch 请求
 * @param {string} path - 请求路径
 * @param {object} options - fetch 选项
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise}
 */
function fetchWithTimeout(path, options, timeout) {
  return Promise.race([
    fetch(path, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求超时，请检查网络连接')), timeout)
    )
  ]);
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 判断错误是否可以重试
 * @param {Error} error - 错误对象
 * @param {number} status - HTTP 状态码
 * @returns {boolean}
 */
function isRetryableError(error, status) {
  // 网络错误或服务器错误（5xx）可以重试
  if (error.message.includes('超时') || error.message.includes('网络')) {
    return true;
  }
  if (status >= 500 && status < 600) {
    return true;
  }
  // 429 Too Many Requests 可以重试
  if (status === 429) {
    return true;
  }
  return false;
}

/**
 * 格式化错误消息
 * @param {number} status - HTTP 状态码
 * @param {object} data - 响应数据
 * @returns {string}
 */
function formatErrorMessage(status, data) {
  // 优先使用服务器返回的错误信息
  if (data?.error) return data.error;
  if (data?.message) return data.message;

  // 根据状态码返回友好的错误信息
  const statusMessages = {
    400: '请求参数错误',
    401: '未登录或登录已过期，请重新登录',
    403: '没有权限执行此操作',
    404: '请求的资源不存在',
    408: '请求超时，请重试',
    429: '请求过于频繁，请稍后再试',
    500: '服务器内部错误，请稍后重试',
    502: '网关错误，请稍后重试',
    503: '服务暂时不可用，请稍后重试',
    504: '网关超时，请稍后重试',
  };

  return statusMessages[status] || `请求失败 (${status})`;
}

// 基础请求函数（带重试）
export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = options.retry !== false ? API_CONFIG.retryAttempts : 0;
  const timeout = options.timeout || API_CONFIG.timeout;

  let lastError = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      // 如果是重试，先延迟
      if (attempt > 0) {
        console.log(`🔄 重试请求 ${path} (${attempt}/${maxAttempts})`);
        await delay(API_CONFIG.retryDelay * attempt);
      }

      // 准备 CSRF 头
      const csrfHeaders = {};
      if (method !== 'GET' && method !== 'HEAD') {
        const token = readCookie('ss_csrf');
        if (token) csrfHeaders['x-csrf-token'] = token;
      }

      // 发送请求（带超时）
      const response = await fetchWithTimeout(path, {
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders,
          ...(options.headers || {}),
        },
        ...options,
      }, timeout);

      // 解析响应
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          console.warn('⚠️ JSON 解析失败:', parseError);
          data = { raw: text };
        }
      }

      // 检查响应状态
      if (!response.ok) {
        const message = formatErrorMessage(response.status, data);
        const error = new Error(message);
        error.status = response.status;
        error.payload = data;

        // 判断是否可以重试
        if (attempt < maxAttempts && isRetryableError(error, response.status)) {
          lastError = error;
          continue; // 重试
        }

        throw error;
      }

      // 成功返回
      return data;

    } catch (error) {
      lastError = error;

      // 判断是否可以重试
      if (attempt < maxAttempts && isRetryableError(error, error.status)) {
        continue; // 重试
      }

      // 不可重试或已达最大重试次数
      break;
    }
  }

  // 所有尝试都失败了
  console.error('❌ 请求失败:', path, lastError);
  throw lastError;
}

// JSON 请求函数
export async function requestJSON(path, options = {}) {
  return request(path, {
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : options.body,
  });
}

// 暴露到全局（向后兼容）
window.shengshengUtils = {
  ...(window.shengshengUtils || {}),
  readCookie,
};
