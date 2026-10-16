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
  // `quit()` waits for in-flight commands; `disconnect()` then drops the
  // socket so ioredis cannot re-arm its retry strategy. Outside Jest this
  // leaves the process with zero active handles — Jest's own module registry
  // still reports the socket as live afterwards, which is why the test script
  // also passes --forceExit.
  redis.disconnect();
});
