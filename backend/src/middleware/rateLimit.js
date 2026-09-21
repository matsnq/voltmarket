const redis = require('../lib/redis');

// Token-bucket rate limiter backed by Redis (atomic via Lua script).
// Every client (user id if authenticated, else IP) has a bucket of `capacity`
// tokens that refills at `refillPerSec` tokens/second. Each request costs 1.
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill)
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill) * 2)
return allowed
`;

function rateLimit({ capacity = 120, refillPerSec = 2, name = 'global' } = {}) {
  return async (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === '1') return next();
    try {
      const id = (req.user && req.user.id) || req.ip;
      const key = `rl:${name}:${id}`;
      const allowed = await redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        key,
        capacity,
        refillPerSec,
        Date.now() / 1000
      );
      if (Number(allowed) === 1) return next();
      res.set('Retry-After', '5');
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    } catch (err) {
      return next(); // fail open if Redis is unreachable — availability over strictness
    }
  };
}

module.exports = { rateLimit };
