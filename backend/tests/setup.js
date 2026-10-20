// Per-test-file setup. Rate limiting is disabled by default so unrelated
// tests don't trip the auth bucket; the rate-limit security test re-enables it.
process.env.NODE_ENV = 'test';

// Tests must be hermetic: no suite should be able to reach a live payment
// provider or identity service, and none should pass or fail depending on
// whether the developer running it happens to have credentials configured.
//
// These are set to empty rather than deleted on purpose. dotenv does not
// overwrite a variable that already exists, so an empty value survives the
// .env being loaded when src/config.js is first required; deleting the key
// would let the real value back in.
for (const key of [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLIC_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
]) {
  process.env[key] = '';
}
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
