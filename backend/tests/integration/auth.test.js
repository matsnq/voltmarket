const request = require('supertest');
const { authenticator } = require('otplib');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');
const { sha256 } = require('../../src/lib/crypto');

const app = createApp();
const unique = Date.now();
const email = `itest-${unique}@itest.local`;
const password = 'Passw0rd1';

function refreshCookie(res) {
  const cookies = res.headers['set-cookie'] || [];
  return cookies.find((c) => c.startsWith('refresh_token='));
}

describe('POST /api/v1/auth/register', () => {
  test('creates an account, returns access token, sets httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Integration Tester', captchaToken: 'ok' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toMatch(/^eyJ/);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('password_hash');
    const cookie = refreshCookie(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('SameSite=Strict');
  });

  test('rejects a failed CAPTCHA', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `x${email}`, password, name: 'Bot', captchaToken: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CAPTCHA/i);
  });

  test('rejects duplicate emails with a helpful message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Dup', captchaToken: 'ok' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe('POST /api/v1/auth/login + token lifecycle', () => {
  test('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  test('same generic 401 for wrong password and unknown email', async () => {
    const wrongPass = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Wrong1234' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${unique}@itest.local`, password });
    expect(wrongPass.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPass.body.error).toBe(unknown.body.error);
  });

  test('refresh rotates the token; the old one is single-use; reuse revokes the family', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie1 = refreshCookie(login);

    // First refresh: succeeds and returns a DIFFERENT cookie.
    const refresh1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(refresh1.status).toBe(200);
    expect(refresh1.body.accessToken).toBeTruthy();
    const cookie2 = refreshCookie(refresh1);
    expect(cookie2).not.toEqual(cookie1);

    // Replaying the OLD cookie must fail (single-use validation)…
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toMatch(/reuse/i);

    // …and the reuse must revoke the whole family, killing the NEW cookie too.
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie2);
    expect(afterReuse.status).toBe(401);
  });

  test('logout revokes both tokens', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = refreshCookie(login);
    const access = login.body.accessToken;

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .set('Cookie', cookie);
    expect(logout.status).toBe(200);

    // Access token is denylisted immediately…
    const meAfter = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${access}`);
    expect(meAfter.status).toBe(401);

    // …and the refresh token is revoked.
    const refreshAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshAfter.status).toBe(401);
  });

  test('protected endpoint rejects missing/invalid tokens', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer garbage')).status
    ).toBe(401);
  });
});

describe('password recovery', () => {
  test('forgot-password always answers 200 (no account enumeration)', async () => {
    const known = await request(app).post('/api/v1/auth/password/forgot').send({ email });
    const unknown = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: `ghost-${unique}@itest.local` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  test('reset link is single-use, expiring, and revokes existing sessions', async () => {
    const user = await db('users').where({ email }).first();
    // Unique per run — reset tokens are stored hashed with a UNIQUE constraint,
    // so a hardcoded value would collide with the row left by a previous run.
    const rawToken = require('crypto').randomBytes(48).toString('hex');
    await db('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: sha256(rawToken),
      expires_at: new Date(Date.now() + 3600000),
    });

    const newPassword = 'NewPassw0rd2';
    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: rawToken, password: newPassword });
    expect(reset.status).toBe(200);

    // Old password no longer works, new one does.
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email, password })).status
    ).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email, password: newPassword })).status
    ).toBe(200);

    // Second use of the same link fails.
    const replay = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: rawToken, password: 'Another0ne3' });
    expect(replay.status).toBe(400);
  });
});

describe('two-factor authentication (TOTP)', () => {
  const tfaEmail = `tfa-${unique}@itest.local`;
  let accessToken;
  let recoveryCodes;
  let secret;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: tfaEmail, password, name: 'TFA Tester', captchaToken: 'ok' });
    accessToken = res.body.accessToken;
  });

  test('setup returns secret + QR, enable verifies the first code', async () => {
    const setup = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png/);
    secret = setup.body.secret;

    const enable = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ otp: authenticator.generate(secret) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(8);
    recoveryCodes = enable.body.recoveryCodes;
  });

  test('login now demands the TOTP code', async () => {
    const noOtp = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: tfaEmail, password });
    expect(noOtp.status).toBe(401);
    expect(noOtp.body.details && noOtp.body.details.code).toBe('2FA_REQUIRED');

    const withOtp = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: tfaEmail, password, otp: authenticator.generate(secret) });
    expect(withOtp.status).toBe(200);
  });

  test('recovery codes work exactly once', async () => {
    const code = recoveryCodes[0];
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: tfaEmail, password, otp: code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: tfaEmail, password, otp: code });
    expect(second.status).toBe(401);
  });
});
