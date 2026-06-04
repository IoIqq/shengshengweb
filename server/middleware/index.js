const { logRequest } = require('../utils/logger');

/**
 * 请求日志中间件
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logRequest(req, res, duration);
  });
  next();
}

/**
 * 错误处理中间件
 */
function errorHandler(err, req, res, next) {
  console.error('Server Error:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404处理中间件
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: '未找到请求的资源' });
}

module.exports = {
  requestLogger,
  errorHandler,
  notFoundHandler
};
