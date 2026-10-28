const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };
