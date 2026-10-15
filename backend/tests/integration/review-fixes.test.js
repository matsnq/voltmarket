const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');
const orders = require('../../src/modules/orders/orders.service');
const payments = require('../../src/modules/payments/payments.service');
const { encryptField, blindIndex } = require('../../src/lib/crypto');

const app = createApp();
const unique = Date.now();
const ADDRESS = {
  recipient: 'Fix Tester',
  street: 'Tartu mnt 5',
  city: 'Tallinn',
  postalCode: '10117',
  country: 'EE',
};

async function placeOrder(email = `fix-${unique}@itest.local`, qty = 1) {
  const product = await db('products').where('stock_quantity', '>=', qty + 2).first();
  const added = await request(app)
    .post('/api/v1/cart/items')
    .send({ productId: product.id, quantity: qty });
  const cookie = (added.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const placed = await request(app)
    .post('/api/v1/checkout')
    .set('Cookie', cookie)
    .send({ email, shippingMethodId: 1, shippingAddress: ADDRESS });
  return { order: placed.body.order, product, cookie };
}

const stockOf = async (id) => (await db('products').where({ id }).first()).stock_quantity;

// Regressions for the six issues raised in peer review.
describe('review fix 1: a card retry after a decline', () => {
  test('a decline keeps the stock reserved, because the shopper can try again', async () => {
    const { order, product } = await placeOrder();
    const reserved = await stockOf(product.id);

    await orders.markPaymentFailed(order.id, { reason: 'Card declined' });

    expect(await stockOf(product.id)).toBe(reserved); // NOT released
    const row = await db('orders').where({ id: order.id }).first();
    expect(row.status).toBe('payment_failed');
    expect(row.reservation_expires_at).toBeTruthy(); // but it will not be held forever
  });

  test('a second card succeeding moves payment_failed → paid', async () => {
    const { order, product } = await placeOrder();
    const reserved = await stockOf(product.id);

    await orders.markPaymentFailed(order.id, { reason: 'Insufficient funds' });
    const result = await orders.markPaid(order.id, { note: 'Second card worked' });

    expect(result.outcome).toBe('paid');
    expect(result.order.status).toBe('paid');
    expect(await stockOf(product.id)).toBe(reserved); // never lost along the way

    const full = await orders.getOrderById(order.id);
    expect(full.timeline.map((t) => t.status)).toEqual([
      'pending_payment', 'payment_failed', 'paid',
    ]);
  });

  test('money arriving after cancellation is reported as unfulfillable, not pocketed', async () => {
    const { order } = await placeOrder();
    await orders.cancelOrder(order.id, { byAdmin: true, reason: 'test' });

    const result = await orders.markPaid(order.id);

    expect(result.outcome).toBe('unfulfillable'); // the worker refunds on this
    const row = await db('orders').where({ id: order.id }).first();
    expect(row.status).toBe('cancelled'); // not silently flipped to paid
  });

  test('paying twice is idempotent', async () => {
    const { order } = await placeOrder();
    expect((await orders.markPaid(order.id)).outcome).toBe('paid');
    expect((await orders.markPaid(order.id)).outcome).toBe('already_paid');
  });
});

describe('review fix 2: a failed handler must not poison its own retry', () => {
  test('releasing the claim lets a retry run again', async () => {
    const key = `queue:retry_${unique}`;
    expect(await payments.claimEvent(key, 'queue', {})).toBe(true);
    expect(await payments.claimEvent(key, 'queue', {})).toBe(false); // concurrent delivery blocked

    await payments.releaseEvent(key); // what the worker's catch block does

    expect(await payments.claimEvent(key, 'queue', {})).toBe(true); // retry proceeds
    await payments.releaseEvent(key);
  });
});

describe('review fix 3: refunds are reachable over HTTP', () => {
  test('the refund route exists and is closed to customers', async () => {
    const { order } = await placeOrder();
    await orders.markPaid(order.id);

    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `norefund-${unique}@itest.local`,
      password: 'Passw0rd1',
      name: 'Not Staff',
      captchaToken: 'ok',
    });
    const res = await request(app)
      .post(`/api/v1/orders/${order.reference}/refund`)
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({});
    expect(res.status).toBe(403); // route exists; role check refuses
  });

  test('cancelling a paid order reports that a refund is owed', async () => {
    const { order } = await placeOrder();
    await orders.markPaid(order.id);

    const result = await orders.cancelOrder(order.id, { byAdmin: true, reason: 'changed mind' });
    expect(result.refundRequired).toBe(true); // the route turns this into a Stripe refund
  });

  test('cancelling an unpaid order owes nothing', async () => {
    const { order } = await placeOrder();
    const result = await orders.cancelOrder(order.id, { byAdmin: true });
    expect(result.refundRequired).toBe(false);
  });
});

describe('review fix 4: abandoned orders release their stock', () => {
  test('an expired reservation returns the stock and cancels the order', async () => {
    const { order, product } = await placeOrder(`stale-${unique}@itest.local`, 2);
    const reserved = await stockOf(product.id);

    await db('orders')
      .where({ id: order.id })
      .update({ reservation_expires_at: new Date(Date.now() - 60000) });

    const expired = await orders.expireStaleReservations();

    expect(expired).toContain(order.reference);
    expect(await stockOf(product.id)).toBe(reserved + 2);
    const row = await db('orders').where({ id: order.id }).first();
    expect(row.status).toBe('cancelled');
    expect(row.cancel_reason).toMatch(/not completed in time/i);
  });

  test('a reservation that has not expired is left alone', async () => {
    const { order, product } = await placeOrder(`fresh-${unique}@itest.local`);
    const reserved = await stockOf(product.id);

    const expired = await orders.expireStaleReservations();

    expect(expired).not.toContain(order.reference);
    expect(await stockOf(product.id)).toBe(reserved);
  });

  test('a paid order is never swept, even with an old expiry', async () => {
    const { order, product } = await placeOrder(`paid-${unique}@itest.local`);
    await orders.markPaid(order.id);
    const afterPaid = await stockOf(product.id);

    await db('orders')
      .where({ id: order.id })
      .update({ reservation_expires_at: new Date(Date.now() - 60000) });
    await orders.expireStaleReservations();

    expect(await stockOf(product.id)).toBe(afterPaid); // goods are sold, not returned
    expect((await db('orders').where({ id: order.id }).first()).status).toBe('paid');
  });
});

describe('review fix 5: order emails fail loudly', () => {
  // The transport is mocked rather than pointed at a real socket: this is
  // about which caller receives the error, not about SMTP, and a mock keeps
  // it instant and deterministic.
  test('required sends rethrow, optional ones stay silent', async () => {
    jest.resetModules();
    jest.doMock('nodemailer', () => ({
      createTransport: () => ({ sendMail: () => Promise.reject(new Error('ECONNREFUSED')) }),
    }));
    const realEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // the test short-circuit would hide this
    try {
      const mailer = require('../../src/lib/mailer');

      // Queue worker: the message must not be acked if the email never went.
      await expect(
        mailer.sendMail({ to: 'x@y.test', subject: 'Order confirmed', html: '<p>x</p>', required: true })
      ).rejects.toThrow(/Could not send/);

      // Request path: a dead mail server must not fail the user's request.
      await expect(
        mailer.sendMail({ to: 'x@y.test', subject: 'Welcome', html: '<p>x</p>' })
      ).resolves.toBeUndefined();
    } finally {
      process.env.NODE_ENV = realEnv;
      jest.dontMock('nodemailer');
      jest.resetModules();
    }
  });
});

describe('review fix 6: saved addresses', () => {
  test('a signed-in checkout saves the address for next time', async () => {
    const email = `addr-${unique}@itest.local`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Passw0rd1', name: 'Address Tester', captchaToken: 'ok' });
    const token = reg.body.accessToken;

    expect((await request(app).get('/api/v1/addresses').set('Authorization', `Bearer ${token}`)).body.addresses)
      .toHaveLength(0);

    const product = await db('products').where('stock_quantity', '>=', 1).first();
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, shippingMethodId: 1, shippingAddress: ADDRESS });

    const after = await request(app)
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.addresses).toHaveLength(1);
    expect(after.body.addresses[0].street).toBe(ADDRESS.street);
    expect(after.body.addresses[0].isDefault).toBe(true);
  });

  test('the same address is not saved twice', async () => {
    const email = `addr2-${unique}@itest.local`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Passw0rd1', name: 'Repeat Buyer', captchaToken: 'ok' });
    const token = reg.body.accessToken;

    for (let i = 0; i < 2; i += 1) {
      const product = await db('products').where('stock_quantity', '>=', 1).first();
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 1 });
      await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, shippingMethodId: 1, shippingAddress: ADDRESS });
    }

    const res = await request(app).get('/api/v1/addresses').set('Authorization', `Bearer ${token}`);
    expect(res.body.addresses).toHaveLength(1);
  });

  test('addresses are stored encrypted and scoped to their owner', async () => {
    const row = await db('addresses').first();
    expect(JSON.stringify(row)).not.toContain(ADDRESS.street);
    expect(row.street_enc).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\./);

    const other = await request(app).post('/api/v1/auth/register').send({
      email: `nosee-${unique}@itest.local`,
      password: 'Passw0rd1',
      name: 'Other Person',
      captchaToken: 'ok',
    });
    const res = await request(app)
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(res.body.addresses).toHaveLength(0);
  });

  test('saved addresses require authentication', async () => {
    expect((await request(app).get('/api/v1/addresses')).status).toBe(401);
  });
});
