const redis = require('./redis');

// Read-through cache for hot catalog queries. TTL-based (short) so admin
// edits appear within seconds without explicit invalidation plumbing.
// Disabled under tests for determinism, and it fails open if Redis is down.
async function cached(key, ttlSec, fn) {
  if (process.env.NODE_ENV === 'test') return fn();
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch {
    /* fall through to the database */
  }
  const value = await fn();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch {
    /* caching is best-effort */
  }
  return value;
}

module.exports = { cached };
