const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const sanitizeRequest = require('./middleware/sanitize');
const { corsMiddleware, enforceOrigin } = require('./middleware/cors');
const { apiLimiter } = require('./middleware/rateLimits');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { UPLOAD_ROOT } = require('./utils/files');

const FRONTEND = path.join(__dirname, 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Only force HTTPS sub-resources when deployed behind TLS.
        upgradeInsecureRequests: env.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

if (!env.isTest) {
  app.use(morgan(env.isProd ? 'combined' : 'dev', { skip: (req) => req.path.startsWith('/api/stream') }));
}

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(sanitizeRequest);

app.use(
  '/uploads',
  express.static(UPLOAD_ROOT, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  })
);
app.use(express.static(FRONTEND, { maxAge: env.isProd ? '1h' : 0 }));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));
app.use('/api', corsMiddleware, enforceOrigin);
app.use('/api/stream', require('./routes/streamRoutes'));
app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api', notFound);

// SPA fallback: every other GET serves the client shell (it uses hash routing).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/uploads/')) return notFound(req, res);
  res.sendFile(path.join(FRONTEND, 'index.html'), (err) => err && next(err));
});

app.use(errorHandler);

module.exports = app;
