const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (req, res, next, options) =>
    res.status(options.statusCode).json({ success: false, message: options.message }),
};

const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 600, message: 'Too many requests, please slow down.' });
const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Too many login attempts. Please try again in a few minutes.',
});
const writeLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 30, message: 'You are posting too fast. Take a breath!' });

module.exports = { apiLimiter, authLimiter, writeLimiter };
