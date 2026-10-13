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

describe('encryption at rest', () => {
  test('user PII is ciphertext in the database, never plaintext', async () => {
    const email = `enc-${Date.now()}@itest.local`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Passw0rd1', name: 'Encryption Tester', captchaToken: 'ok' });

    await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ phone: '+372 5555 1234' });

    const row = await db('users').where({ email }).first();
    // Phone and TOTP secrets are AES-256-GCM: iv.tag.ciphertext, base64 parts.
    expect(row.phone_enc).not.toContain('5555');
    expect(row.phone_enc).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\./);
    // Passwords are bcrypt-hashed, never encrypted (they need no reading back).
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toContain('Passw0rd1');
  });

  test('order PII is encrypted, with a blind index for lookups', async () => {
    const product = await db('products')
      .where('is_active', true)
      .where('stock_quantity', '>=', 1)
      .first();
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 1 });
    const cookies = (added.headers['set-cookie'] || [])
      .map((c) => c.split(';')[0])
      .join('; ');

    const email = `order-enc-${Date.now()}@itest.local`;
    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', cookies)
      .send({
        email,
        shippingMethodId: 1,
        shippingAddress: {
          recipient: 'Secret Buyer',
          street: 'Hidden Street 9',
          city: 'Tallinn',
          postalCode: '10115',
          country: 'EE',
        },
      });
    expect(placed.status).toBe(201);

    const row = await db('orders').where({ reference: placed.body.order.reference }).first();
    const dump = JSON.stringify(row);
    // Neither the buyer's email nor their address appears in the stored row.
    expect(dump).not.toContain(email);
    expect(dump).not.toContain('Hidden Street 9');
    expect(dump).not.toContain('Secret Buyer');
    // But a deterministic blind index allows the guest to look the order up.
    expect(row.email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row).not.toHaveProperty('email'); // the plaintext column is gone

    // Payment records deliberately hold no cardholder data at all — only the
    // provider's reference — so there is nothing sensitive left to encrypt.
    const paymentColumns = Object.keys(
      (await db('payments').columnInfo())
    );
    for (const forbidden of ['card_number', 'cvv', 'card_last4', 'pan', 'expiry']) {
      expect(paymentColumns).not.toContain(forbidden);
    }
  });
});
