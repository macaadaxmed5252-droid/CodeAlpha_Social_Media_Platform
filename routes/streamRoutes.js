const router = require('express').Router();
const realtime = require('../utils/realtime');
const { verifyToken } = require('../utils/token');

// EventSource cannot send headers, so the optional token travels as a query param.
// Request logging skips this route so tokens never land in access logs.
router.get('/', (req, res) => {
  let userId = null;
  if (typeof req.query.token === 'string' && req.query.token) {
    try {
      userId = verifyToken(req.query.token).sub;
    } catch {
      userId = null;
    }
  }
  realtime.subscribe(req, res, userId);
});

module.exports = router;
