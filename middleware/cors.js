const cors = require('cors');
const env = require('../config/env');

/**
 * CORS allow-list. Same-origin requests (the bundled SPA) are always allowed;
 * cross-origin browsers must be listed in CORS_ORIGINS. Disallowed origins get
 * a hard 403 on the API instead of silently missing CORS headers.
 */
function isAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return true; // same-origin navigation, curl, server-to-server
  const self = `${req.protocol}://${req.get('host')}`;
  return origin === self || env.corsOrigins.includes(origin);
}

const corsMiddleware = cors((req, cb) =>
  cb(null, {
    origin: isAllowed(req),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

function enforceOrigin(req, res, next) {
  if (isAllowed(req)) return next();
  res.status(403).json({ success: false, message: 'Origin not allowed' });
}

module.exports = { corsMiddleware, enforceOrigin };
