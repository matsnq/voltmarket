const Redis = require('ioredis');
const config = require('../config');

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('error', (err) => {
  // Log once per burst instead of crashing; features degrade gracefully.
  if (!redis.__lastErrLog || Date.now() - redis.__lastErrLog > 10000) {
    console.error('[redis]', err.message);
    redis.__lastErrLog = Date.now();
  }
});

module.exports = redis;
