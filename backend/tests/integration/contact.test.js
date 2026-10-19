// The contact form is the only write endpoint open to anonymous visitors, so
// what it refuses matters as much as what it accepts.
const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');
const bcrypt = require('bcryptjs');
const { decryptField } = require('../../src/lib/crypto');

const app = createApp();
const unique = Date.now();

const MESSAGE = {
  name: 'Kati Karu',
  email: `kati-${unique}@example.com`,
  topic: 'order',
  subject: 'Where is my wallbox?',
  message: 'I ordered a charger last week and the tracking has not moved since Tuesday.',
};

// The seeded admin has 2FA enabled, which admin routes require, so these
// tests use a support account. It is created here rather than relied upon
// from the seed: an earlier version looked one up and returned early when it
// found none, so the test passed while asserting nothing.
async function staffToken() {
  const email = `support-${unique}@itest.local`;
  await db('users').insert({
    email,
    password_hash: bcrypt.hashSync('Support123!', 10),
    name: 'Test Support',
    role: 'support',
    email_verified: true,
  });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Support123!' });
  if (!res.body.accessToken) throw new Error(`support login failed: ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

describe('POST /api/v1/contact', () => {
  test('a guest can send a message', async () => {
    const res = await request(app).post('/api/v1/contact').send(MESSAGE);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.message).toMatch(/support team/i);
  });

  test('the message is stored with its PII encrypted', async () => {
    const row = await db('contact_messages')
      .where({ subject: MESSAGE.subject })
      .orderBy('created_at', 'desc')
      .first();

    expect(row).toBeTruthy();
    // The raw columns must not contain readable PII...
    expect(row.email_enc).not.toContain(MESSAGE.email);
    expect(row.body_enc).not.toContain('tracking');
    // ...but must decrypt back to exactly what was sent.
    expect(decryptField(row.email_enc)).toBe(MESSAGE.email);
    expect(decryptField(row.body_enc)).toBe(MESSAGE.message);
    expect(row.status).toBe('new');
    expect(row.user_id).toBeNull();
  });

  test('a too-short message is refused', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ ...MESSAGE, message: 'help' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toMatch(/sentence/i);
  });

  test('a bad email is refused', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ ...MESSAGE, email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  test('an unknown topic is refused (whitelisting)', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ ...MESSAGE, topic: 'refund-me-now' });

    expect(res.status).toBe(400);
  });

  test('a malformed order reference is refused', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ ...MESSAGE, orderReference: 'DROP TABLE orders' });

    expect(res.status).toBe(400);
  });

  test('unknown fields are stripped rather than stored', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ ...MESSAGE, status: 'closed', handled_by: 'me' });

    expect(res.status).toBe(400);
  });

  test('a signed-in sender is linked to their account', async () => {
    const email = `member-${unique}@itest.local`;
    const reg = await request(app).post('/api/v1/auth/register').send({
      email, password: 'Passw0rd1', name: 'Member Sender', captchaToken: 'ok',
    });

    const res = await request(app)
      .post('/api/v1/contact')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ ...MESSAGE, email, subject: `Signed in ${unique}` });

    expect(res.status).toBe(201);
    const row = await db('contact_messages').where({ subject: `Signed in ${unique}` }).first();
    expect(row.user_id).toBeTruthy();
  });
});

describe('support inbox (staff only)', () => {
  test('the inbox is closed to anonymous visitors', async () => {
    await request(app).get('/api/v1/admin/contact-messages').expect(401);
  });

  test('the inbox is closed to ordinary customers', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `nosy-${unique}@itest.local`,
      password: 'Passw0rd1',
      name: 'Nosy Customer',
      captchaToken: 'ok',
    });

    await request(app)
      .get('/api/v1/admin/contact-messages')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .expect(403);
  });

  test('staff read decrypted messages and can advance the status', async () => {
    const token = await staffToken();

    const list = await request(app)
      .get('/api/v1/admin/contact-messages?status=new')
      .set('Authorization', `Bearer ${token}`);

    expect(list.status).toBe(200);
    const found = list.body.messages.find((m) => m.subject === MESSAGE.subject);
    expect(found.email).toBe(MESSAGE.email); // decrypted for staff
    expect(found.message).toBe(MESSAGE.message);

    const patched = await request(app)
      .patch(`/api/v1/admin/contact-messages/${found.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(patched.status).toBe(200);
    expect(patched.body.message.status).toBe('in_progress');

    // Handling a message is a staff action, so it belongs in the audit log.
    const audit = await db('audit_logs')
      .where({ entity: 'contact_messages', entity_id: found.id })
      .first();
    expect(audit.action).toBe('contact.in_progress');
  });
});
