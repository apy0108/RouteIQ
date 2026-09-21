/**
 * Global Error Handler Middleware
 * Catches all uncaught and delegated errors in Express and returns uniform JSON responses.
 */

const config = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (statusCode >= 500) {
    console.error('💥 Unhandled Server Error [500]:', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip
    });
  }

  const responseBody = {
    success: false,
    error: message,
    code: statusCode
  };

  if (config.nodeEnv !== 'production' && err.stack) {
    responseBody.stack = err.stack;
  }

  return res.status(statusCode).json(responseBody);
}

module.exports = errorHandler;
