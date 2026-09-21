/**
 * RouteIQ Main Express Server
 * Bootstraps the backend server, security middleware, static file serving, API routes, and error handling.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter, chatLimiter, trainLimiter } = require('./middleware/rateLimit');

const botsRouter = require('./routes/bots');
const trainRouter = require('./routes/train');
const chatRouter = require('./routes/chat');
const leadsRouter = require('./routes/leads');

// Ensure uploads directory exists on startup
const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
console.log('📁 Uploads directory ready');

const app = express();

// 1. Security & Body Parsing Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiter to all incoming requests
app.use(generalLimiter);

// 2. Static file serving for external embed widget
app.use('/widget', express.static(path.join(__dirname, '..', 'widget')));

// 3. Health Check Endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// 4. Mount API Routes
app.use('/api/bots', botsRouter);
app.use('/api/train', trainLimiter, trainRouter);
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api/leads', leadsRouter);

// 5. 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`,
    code: 404
  });
});

// 6. Global Error Handling Middleware (must be last)
app.use(errorHandler);

// 7. Start Server
const server = app.listen(config.port, () => {
  console.log(`🚀 RouteIQ server running on port ${config.port}`);
});

module.exports = { app, server };
