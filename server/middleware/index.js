const { logRequest } = require('../utils/logger');

const STATIC_ASSET_RE = /\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map)$/i;

/**
 * 请求日志中间件
 */
function shouldSkipRequestLogBeforeFinish(req) {
  const requestPath = req.path || req.url || '';
  if (req.method === 'GET' && requestPath === '/api/health') return true;
  if (requestPath.startsWith('/uploads/')) return true;
  return STATIC_ASSET_RE.test(requestPath);
}

function shouldSkipRequestLogAfterFinish(res) {
  return res.statusCode === 304;
}

function requestLogger(req, res, next) {
  if (shouldSkipRequestLogBeforeFinish(req)) return next();

  const startTime = Date.now();
  res.on('finish', () => {
    if (shouldSkipRequestLogAfterFinish(res)) return;
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
