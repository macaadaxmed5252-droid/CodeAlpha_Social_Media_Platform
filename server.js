const env = require('./Backend/config/env');
const app = require('./Backend/app');
const { connectDB } = require('./Backend/config/db');

async function start() {
  try {
    await connectDB(env.mongoUri);
    console.log(`[db] connected to ${env.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => console.log(`[pulse] running at http://localhost:${env.port}`));

  const shutdown = (signal) => {
    console.log(`[pulse] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
