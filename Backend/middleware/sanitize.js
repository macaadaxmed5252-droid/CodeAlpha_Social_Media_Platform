const { stripOperators } = require('../utils/sanitize');

/** Removes `$`-prefixed / dotted keys from body and params to block NoSQL operator injection. */
module.exports = function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = stripOperators(req.body);
  if (req.params && typeof req.params === 'object') req.params = stripOperators(req.params);
  next();
};
