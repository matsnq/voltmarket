// Delivery options are the one piece of admin CRUD that checkout depends on
// directly: remove them all and nobody can buy anything. The guards matter
// more than the CRUD here.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');
const { encryptField } = require('../../src/lib/crypto');

const app = createApp();
const unique = Date.now();

// A fresh account per call: building the address from the role alone made a
// second call for the same role collide on the unique email.
let seq = 0;

// Admin routes refuse an admin without 2FA, so an admin fixture needs a real
// enrolled secret and a real code — there is no way to sidestep the rule, and
// a test that sidestepped it would not be testing what ships.
async function staffToken(role) {
  seq += 1;
  const email = `${role}-ship-${unique}-${seq}@itest.local`;
  const isAdmin = role === 'admin';
  const secret = isAdmin ? authenticator.generateSecret() : null;

  await db('users').insert({
    email,
    password_hash: bcrypt.hashSync('Passw0rd1', 10),
    name: `Ship ${role}`,
    role,
    email_verified: true,
    totp_enabled: isAdmin,
    ...(secret ? { totp_secret_enc: encryptField(secret) } : {}),
  });

  const body = { email, password: 'Passw0rd1' };
  if (secret) body.otp = authenticator.generate(secret);

  const res = await request(app).post('/api/v1/auth/login').send(body);
  if (!res.body.accessToken) throw new Error(`${role} login failed: ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// Place a real order against a given method rather than hoping another suite
// has left one behind: the test database is truncated and reseeded, and suite
// order is not something this test should depend on.
async function placeOrderWith(shippingMethodId) {
  const product = await db('products').where('stock_quantity', '>=', 1).first();
  const added = await request(app)
    .post('/api/v1/cart/items')
    .send({ productId: product.id, quantity: 1 });
  const cookie = (added.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const placed = await request(app)
    .post('/api/v1/checkout')
    .set('Cookie', cookie)
    .send({
      email: `ship-order-${unique}@itest.local`,
      shippingMethodId,
      shippingAddress: {
        recipient: 'Ship Tester',
        street: 'Tartu mnt 5',
        city: 'Tallinn',
        postalCode: '10117',
        country: 'EE',
      },
    });
  if (placed.status !== 201) throw new Error(`checkout failed: ${JSON.stringify(placed.body)}`);
  return placed.body.order;
}

const METHOD = {
  name: 'Drone drop',
  description: 'Experimental rooftop delivery for small accessories.',
  priceCents: 2999,
  etaDaysMin: 1,
  etaDaysMax: 2,
};

describe('admin delivery options', () => {
  let sales;
  let admin;
  let createdId;

  beforeAll(async () => {
    sales = await staffToken('sales');
    admin = await staffToken('admin');
  });

  test('staff can list options, with the order count behind each', async () => {
    const res = await request(app).get('/api/v1/admin/shipping-methods').set(auth(sales));
    expect(res.status).toBe(200);
    expect(res.body.shippingMethods.length).toBeGreaterThan(0);
    const standard = res.body.shippingMethods.find((m) => m.code === 'standard');
    expect(standard).toBeTruthy();
    expect(typeof standard.orderCount).toBe('number');
  });

  test('a new option is created with a code derived from its name', async () => {
    const res = await request(app).post('/api/v1/admin/shipping-methods').set(auth(sales)).send(METHOD);
    expect(res.status).toBe(201);
    expect(res.body.shippingMethod.code).toBe('drone_drop');
    expect(res.body.shippingMethod.price.formatted).toBe('€29.99');
    expect(res.body.shippingMethod.isActive).toBe(true);
    createdId = res.body.shippingMethod.id;
  });

  test('it immediately appears at checkout', async () => {
    const res = await request(app).get('/api/v1/shipping-methods');
    expect(res.body.shippingMethods.some((m) => m.code === 'drone_drop')).toBe(true);
  });

  test('a delivery window that ends before it starts is refused', async () => {
    const res = await request(app)
      .post('/api/v1/admin/shipping-methods')
      .set(auth(sales))
      .send({ ...METHOD, name: 'Backwards', etaDaysMin: 9, etaDaysMax: 3 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toMatch(/earlier than the earliest/i);
  });

  test('a partial update cannot create an invalid window either', async () => {
    // Valid on its own, invalid once merged with the stored minimum of 1.
    const res = await request(app)
      .patch(`/api/v1/admin/shipping-methods/${createdId}`)
      .set(auth(sales))
      .send({ etaDaysMin: 8 });
    expect(res.status).toBe(400);
  });

  test('hiding an option removes it from checkout but keeps the row', async () => {
    await request(app)
      .patch(`/api/v1/admin/shipping-methods/${createdId}`)
      .set(auth(sales))
      .send({ isActive: false })
      .expect(200);

    const checkout = await request(app).get('/api/v1/shipping-methods');
    expect(checkout.body.shippingMethods.some((m) => m.code === 'drone_drop')).toBe(false);

    const adminList = await request(app).get('/api/v1/admin/shipping-methods').set(auth(sales));
    expect(adminList.body.shippingMethods.some((m) => m.code === 'drone_drop')).toBe(true);
  });

  test('an unused option is deleted outright', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/shipping-methods/${createdId}`)
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, deactivated: false });
    const row = await db('shipping_methods').where({ id: createdId }).first();
    expect(row).toBeUndefined();
  });

  test('an option an order has used is hidden, not deleted', async () => {
    const victim = await request(app)
      .post('/api/v1/admin/shipping-methods')
      .set(auth(sales))
      .send({ ...METHOD, name: 'Used by an order' });
    const methodId = victim.body.shippingMethod.id;
    const order = await placeOrderWith(methodId);

    const res = await request(app)
      .delete(`/api/v1/admin/shipping-methods/${methodId}`)
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(false);
    expect(res.body.deactivated).toBe(true);
    expect(res.body.orderCount).toBe(1);

    // The row survives and the order still knows how it shipped.
    const row = await db('shipping_methods').where({ id: methodId }).first();
    expect(row).toBeTruthy();
    expect(row.is_active).toBe(false);
    const stored = await db('orders').where({ reference: order.reference }).first();
    expect(stored.shipping_method_id).toBe(methodId);
  });

  test('the last active option cannot be hidden — checkout needs one', async () => {
    const active = await db('shipping_methods').where({ is_active: true }).pluck('id');
    const [keep, ...rest] = active;
    if (rest.length) await db('shipping_methods').whereIn('id', rest).update({ is_active: false });

    const res = await request(app)
      .patch(`/api/v1/admin/shipping-methods/${keep}`)
      .set(auth(sales))
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only active delivery option/i);

    await db('shipping_methods').whereIn('id', active).update({ is_active: true });
  });

  test('nor can the last active option be deleted, even when unused', async () => {
    // The guard originally lived only on the deactivate path, so deleting an
    // unused last option emptied the list and broke checkout silently.
    const created = await request(app)
      .post('/api/v1/admin/shipping-methods')
      .set(auth(sales))
      .send({ ...METHOD, name: 'Only one left' });
    const soloId = created.body.shippingMethod.id;

    const others = await db('shipping_methods').whereNot('id', soloId).pluck('id');
    await db('shipping_methods').whereIn('id', others).update({ is_active: false });

    const res = await request(app)
      .delete(`/api/v1/admin/shipping-methods/${soloId}`)
      .set(auth(admin));

    expect(res.status).toBe(409);
    expect(await db('shipping_methods').where({ id: soloId }).first()).toBeTruthy();
    expect((await request(app).get('/api/v1/shipping-methods')).body.shippingMethods.length).toBeGreaterThan(0);

    await db('shipping_methods').whereIn('id', others).update({ is_active: true });
    await db('shipping_methods').where({ id: soloId }).del();
  });

  test('every change is written to the audit log', async () => {
    const row = await db('audit_logs')
      .where({ entity: 'shipping_methods' })
      .orderBy('created_at', 'desc')
      .first();
    expect(row).toBeTruthy();
    expect(row.action).toMatch(/^shipping_method\./);
  });
});

describe('delivery option authorization', () => {
  test('a customer cannot read or write delivery options', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `ship-nosy-${unique}@itest.local`,
      password: 'Passw0rd1',
      name: 'Nosy',
      captchaToken: 'ok',
    });
    const t = reg.body.accessToken;
    await request(app).get('/api/v1/admin/shipping-methods').set(auth(t)).expect(403);
    await request(app).post('/api/v1/admin/shipping-methods').set(auth(t)).send(METHOD).expect(403);
  });

  test('support may read them but not change them', async () => {
    const support = await staffToken('support');
    await request(app).get('/api/v1/admin/shipping-methods').set(auth(support)).expect(200);
    await request(app).post('/api/v1/admin/shipping-methods').set(auth(support)).send(METHOD).expect(403);
  });

  test('deleting is reserved to admins', async () => {
    const sales2 = await staffToken('sales');
    const created = await request(app)
      .post('/api/v1/admin/shipping-methods')
      .set(auth(sales2))
      .send({ ...METHOD, name: 'Sales cannot delete me' });
    await request(app)
      .delete(`/api/v1/admin/shipping-methods/${created.body.shippingMethod.id}`)
      .set(auth(sales2))
      .expect(403);
    await db('shipping_methods').where({ id: created.body.shippingMethod.id }).del();
  });
});
