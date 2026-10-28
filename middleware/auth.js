const User = require('../models/User');
const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/token');

function readBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError('Account no longer exists', 401);
  return user;
}

/** Requires a valid JWT; attaches the user document to req.user. */
async function protect(req, res, next) {
  try {
    const token = readBearer(req);
    if (!token) throw new AppError('Please log in to continue', 401);
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
async function optionalAuth(req, res, next) {
  const token = readBearer(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { protect, optionalAuth };
