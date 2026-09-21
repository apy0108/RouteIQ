/**
 * Rate Limiting Middleware Module
 * Uses express-rate-limit to prevent abuse on general, training, and chat endpoints.
 */

const { rateLimit } = require('express-rate-limit');

/**
 * Chat endpoint rate limiter: 30 requests per minute per IP
 */
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many chat requests from this IP, please try again after a minute.',
    code: 429
  }
});

/**
 * Training endpoint rate limiter: 5 requests per 10 minutes per IP
 */
const trainLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Training rate limit exceeded. You can initiate up to 5 training tasks every 10 minutes.',
    code: 429
  }
});

/**
 * General API rate limiter: 100 requests per minute per IP
 */
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please slow down.',
    code: 429
  }
});

module.exports = {
  chatLimiter,
  trainLimiter,
  generalLimiter
};
