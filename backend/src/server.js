const createApp = require('./app');
const config = require('./config');
const db = require('./lib/db');
const redis = require('./lib/redis');

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port} (${config.env})`);
});

async function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await Promise.allSettled([db.destroy(), redis.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
