const rateLimit = require('express-rate-limit');

// 全局速率限制
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制1000次请求
  message: { error: '请求过于频繁,请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// 登录接口严格限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次登录尝试
  message: { error: '登录尝试次数过多,请15分钟后再试。' },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// 写接口限速工厂（已登录场景，相对宽松，避免误伤正常使用）
const makeWriteLimiter = (max, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const uploadLimiter = makeWriteLimiter(30, '上传过于频繁,请稍后再试。');
const borrowLimiter = makeWriteLimiter(30, '借出申请提交过于频繁,请稍后再试。');
const teamWriteLimiter = makeWriteLimiter(20, '团队成员变更过于频繁,请稍后再试。');

// 留言提交速率限制
const wishLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 最多5条留言
  message: { error: '留言过于频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// 客户端日志限流
const clientLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '客户端日志上报过于频繁。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

module.exports = {
  globalLimiter,
  loginLimiter,
  uploadLimiter,
  borrowLimiter,
  teamWriteLimiter,
  wishLimiter,
  clientLogLimiter,
};
