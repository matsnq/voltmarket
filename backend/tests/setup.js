// Per-test-file setup. Rate limiting is disabled by default so unrelated
// tests don't trip the auth bucket; the rate-limit security test re-enables it.
process.env.NODE_ENV = 'test';
if (process.env.DISABLE_RATE_LIMIT === undefined) {
  process.env.DISABLE_RATE_LIMIT = '1';
}

jest.setTimeout(20000);

afterAll(async () => {
  const db = require('../src/lib/db');
  const redis = require('../src/lib/redis');
  await Promise.allSettled([db.destroy(), redis.quit()]);
});
