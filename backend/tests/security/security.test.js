const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');

const app = createApp();

describe('injection resistance', () => {
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE products; --",
    '" OR ""="',
    "1; SELECT pg_sleep(5); --",
    '<script>alert(1)</script>',
  ];

  test.each(payloads)('search query survives payload: %s', async (payload) => {
    const res = await request(app).get('/api/v1/products').query({ q: payload });
    // Parameterized queries: either a clean empty result or a validation 400 —
    // never a 500 and never damage.
    expect([200, 400]).toContain(res.status);
    const stillThere = await db('products').count('id as n').first();
    expect(Number(stillThere.n)).toBeGreaterThan(30);
  });

  test('login is immune to SQL injection', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: "admin@voltmarket.local' --", password: "' OR '1'='1" });
    expect([400, 401]).toContain(res.status);
  });

  test('slug parameter rejects path/SQL characters', async () => {
    const res = await request(app).get(
      `/api/v1/products/${encodeURIComponent("x'; DROP TABLE products;--")}`
    );
    expect(res.status).toBe(400);
  });

  test('stored XSS blocked at registration (name whitelist)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: `xss-${Date.now()}@itest.local`,
      password: 'Passw0rd1',
      name: '<img src=x onerror=alert(1)>',
      captchaToken: 'ok',
    });
    expect(res.status).toBe(400);
  });
});

describe('malformed input handling', () => {
  test('broken JSON body returns 400, not a crash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.co", ');
    expect(res.status).toBe(400);
  });

  test('unknown query parameters are rejected (whitelisting)', async () => {
    const res = await request(app).get('/api/v1/products?evil=1');
    expect(res.status).toBe(400);
  });

  test('absurd pagination values are rejected', async () => {
    expect((await request(app).get('/api/v1/products?page=999999')).status).toBe(400);
    expect((await request(app).get('/api/v1/products?perPage=-5')).status).toBe(400);
  });
});

describe('security headers (helmet)', () => {
  test('sets protective headers on every response', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('token-bucket rate limiting', () => {
  test('throttles a burst on the auth endpoints with 429', async () => {
    process.env.DISABLE_RATE_LIMIT = '0';
    try {
      const results = [];
      for (let i = 0; i < 15; i += 1) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'burst@itest.local', password: 'Wrong123' });
        results.push(res.status);
      }
      expect(results).toContain(429);
      // Well-behaved clients get a Retry-After hint.
      const limited = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'burst@itest.local', password: 'Wrong123' });
      expect(limited.headers['retry-after']).toBeTruthy();
    } finally {
      process.env.DISABLE_RATE_LIMIT = '1';
    }
  });
});
