require('dotenv').config();

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/codealpha_social',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

env.isProd = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (!env.jwtSecret) {
  if (env.isProd) throw new Error('JWT_SECRET must be set in production');
  env.jwtSecret = 'dev-only-insecure-secret';
  if (!env.isTest) console.warn('[env] JWT_SECRET not set - using an insecure development secret');
}

module.exports = env;
