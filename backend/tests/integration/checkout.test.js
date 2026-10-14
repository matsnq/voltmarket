const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');
const orders = require('../../src/modules/orders/orders.service');

const app = createApp();
const unique = Date.now();

const ADDRESS = {
  recipient: 'Checkout Tester',
  street: 'Tartu mnt 5',
  city: 'Tallinn',
  postalCode: '10117',
  country: 'EE',
};

function cookieJar(res) {
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
}

async function pickProduct(minStock = 5) {
  const row = await db('products')
    .where('is_active', true)
    .where('stock_quantity', '>=', minStock)
    .orderBy('id')
    .first();
  return row;
}

describe('critical flow: guest checkout', () => {
  let cookies;
  let product;
  let order;

  beforeAll(async () => {
    product = await pickProduct();
  });

  test('a guest can fill a cart without registering', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.cart.itemCount).toBe(2);
    expect(res.body.cart.subtotal.cents).toBe(product.price_cents * 2);
    cookies = cookieJar(res);
    expect(cookies).toContain('cart_token');
  });

  test('the cart survives across requests and shows recommendations', async () => {
    const res = await request(app).get('/api/v1/cart').set('Cookie', cookies);
    expect(res.body.cart.itemCount).toBe(2);
    expect(Array.isArray(res.body.cart.related)).toBe(true);
  });

  test('quantities can be updated and items removed', async () => {
    const cart = (await request(app).get('/api/v1/cart').set('Cookie', cookies)).body.cart;
    const itemId = cart.items[0].id;

    const updated = await request(app)
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Cookie', cookies)
      .send({ quantity: 3 });
    expect(updated.body.cart.itemCount).toBe(3);

    const removed = await request(app)
      .delete(`/api/v1/cart/items/${itemId}`)
      .set('Cookie', cookies);
    expect(removed.body.cart.itemCount).toBe(0);
  });

  test('checkout requires a non-empty cart', async () => {
    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', cookies)
      .send({ email: 'guest@itest.local', shippingMethodId: 1, shippingAddress: ADDRESS });
    expect(res.status).toBe(400);
  });

  test('a guest completes checkout and receives a pending order', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Cookie', cookies)
      .send({ productId: product.id, quantity: 2 });

    const method = await db('shipping_methods').where({ code: 'standard' }).first();
    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', cookies)
      .send({
        email: `guest-${unique}@itest.local`,
        shippingMethodId: method.id,
        shippingAddress: ADDRESS,
      });

    expect(res.status).toBe(201);
    order = res.body.order;
    expect(order.reference).toMatch(/^VM-/);
    expect(order.status).toBe('pending_payment');
    expect(order.subtotal.cents).toBe(product.price_cents * 2);
    expect(order.shipping.cents).toBe(method.price_cents);
    expect(order.total.cents).toBe(order.subtotal.cents + order.shipping.cents);
    expect(order.shippingAddress.city).toBe('Tallinn'); // decrypted round-trip
  });

  test('the cart is emptied once the order exists', async () => {
    const res = await request(app).get('/api/v1/cart').set('Cookie', cookies);
    expect(res.body.cart.itemCount).toBe(0);
  });

  test('stock was reserved at placement', async () => {
    const after = await db('products').where({ id: product.id }).first();
    expect(after.stock_quantity).toBe(product.stock_quantity - 2);
  });

  test('a guest retrieves the order with reference + email, but not without', async () => {
    const ok = await request(app)
      .get(`/api/v1/orders/${order.reference}`)
      .query({ email: `guest-${unique}@itest.local` });
    expect(ok.status).toBe(200);
    expect(ok.body.order.reference).toBe(order.reference);

    const denied = await request(app).get(`/api/v1/orders/${order.reference}`);
    expect(denied.status).toBe(403);

    const wrongEmail = await request(app)
      .get(`/api/v1/orders/${order.reference}`)
      .query({ email: 'someone-else@itest.local' });
    expect(wrongEmail.status).toBe(403);
  });

  test('address is stored encrypted, never as plaintext', async () => {
    const row = await db('orders').where({ reference: order.reference }).first();
    expect(row.shipping_address_enc).not.toContain('Tallinn');
    expect(row.shipping_address_enc).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\./);
  });
});

describe('critical flow: logged-in checkout', () => {
  const email = `buyer-${unique}@itest.local`;
  const password = 'Passw0rd1';
  let token;
  let product;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Checkout Buyer', captchaToken: 'ok' });
    token = res.body.accessToken;
    product = await pickProduct();
  });

  test('a guest cart merges into the account on login', async () => {
    const guest = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 2 });
    const guestCookies = cookieJar(guest);

    const merged = await request(app)
      .get('/api/v1/cart')
      .set('Cookie', guestCookies)
      .set('Authorization', `Bearer ${token}`);
    expect(merged.body.cart.itemCount).toBe(2);

    // The account cart persists without the guest cookie.
    const persisted = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(persisted.body.cart.itemCount).toBe(2);
  });

  test('checkout attaches the order to the account', async () => {
    const method = await db('shipping_methods').where({ code: 'express' }).first();
    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, shippingMethodId: method.id, shippingAddress: ADDRESS });

    expect(res.status).toBe(201);
    const row = await db('orders').where({ reference: res.body.order.reference }).first();
    expect(row.user_id).toBeTruthy();
  });

  test('order history is filterable by status and date', async () => {
    const all = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThan(0);

    const pending = await request(app)
      .get('/api/v1/orders?status=pending_payment')
      .set('Authorization', `Bearer ${token}`);
    expect(pending.body.orders.every((o) => o.status === 'pending_payment')).toBe(true);

    const none = await request(app)
      .get('/api/v1/orders?status=delivered')
      .set('Authorization', `Bearer ${token}`);
    expect(none.body.orders).toHaveLength(0);

    const today = new Date().toISOString().slice(0, 10);
    const dated = await request(app)
      .get(`/api/v1/orders?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    expect(dated.body.total).toBeGreaterThan(0);
  });

  test('order history is private to its owner', async () => {
    const other = await request(app).post('/api/v1/auth/register').send({
      email: `other-${unique}@itest.local`,
      password,
      name: 'Other Shopper',
      captchaToken: 'ok',
    });
    const mine = await request(app).get('/api/v1/orders').set('Authorization', `Bearer ${token}`);
    const theirs = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(mine.body.total).toBeGreaterThan(0);
    expect(theirs.body.total).toBe(0);

    const ref = mine.body.orders[0].reference;
    const peek = await request(app)
      .get(`/api/v1/orders/${ref}`)
      .set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(peek.status).toBe(403);
  });

  test('cancelling before processing releases the reserved stock', async () => {
    const fresh = await pickProduct();
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: fresh.id, quantity: 2 });

    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, shippingMethodId: 1, shippingAddress: ADDRESS });
    const reserved = await db('products').where({ id: fresh.id }).first();
    expect(reserved.stock_quantity).toBe(fresh.stock_quantity - 2);

    const cancelled = await request(app)
      .post(`/api/v1/orders/${placed.body.order.reference}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Changed my mind' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.status).toBe('cancelled');

    const restored = await db('products').where({ id: fresh.id }).first();
    expect(restored.stock_quantity).toBe(fresh.stock_quantity);

    const again = await request(app)
      .post(`/api/v1/orders/${placed.body.order.reference}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(again.status).toBe(409);
  });
});

describe('inventory integrity', () => {
  test('two concurrent checkouts cannot oversell the last unit', async () => {
    const product = await pickProduct();
    await db('products').where({ id: product.id }).update({ stock_quantity: 1 });

    const buyers = await Promise.all(
      [1, 2].map(async () => {
        const added = await request(app)
          .post('/api/v1/cart/items')
          .send({ productId: product.id, quantity: 1 });
        return cookieJar(added);
      })
    );

    const results = await Promise.all(
      buyers.map((cookies) =>
        request(app)
          .post('/api/v1/checkout')
          .set('Cookie', cookies)
          .send({
            email: `race-${unique}@itest.local`,
            shippingMethodId: 1,
            shippingAddress: ADDRESS,
          })
      )
    );

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body.error).toMatch(/left in stock/i);

    const after = await db('products').where({ id: product.id }).first();
    expect(after.stock_quantity).toBe(0); // never negative
  });

  test('a payment failure returns the reserved stock', async () => {
    const product = await pickProduct();
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 2 });
    const cookies = cookieJar(added);

    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', cookies)
      .send({
        email: `fail-${unique}@itest.local`,
        shippingMethodId: 1,
        shippingAddress: ADDRESS,
      });
    const reserved = await db('products').where({ id: product.id }).first();
    expect(reserved.stock_quantity).toBe(product.stock_quantity - 2);

    // What the queue worker does when Stripe reports a decline.
    await orders.markPaymentFailed(placed.body.order.id, { reason: 'Card declined' });

    const restored = await db('products').where({ id: product.id }).first();
    expect(restored.stock_quantity).toBe(product.stock_quantity);
    const row = await db('orders').where({ id: placed.body.order.id }).first();
    expect(row.status).toBe('payment_failed');
  });

  test('status transitions are idempotent, so a redelivered message is harmless', async () => {
    const product = await pickProduct();
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 1 });
    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', cookieJar(added))
      .send({
        email: `dup-${unique}@itest.local`,
        shippingMethodId: 1,
        shippingAddress: ADDRESS,
      });

    await orders.markPaid(placed.body.order.id);
    const afterFirst = await db('products').where({ id: product.id }).first();

    // Same event delivered twice must not move the order on again.
    await orders.markPaid(placed.body.order.id);
    await orders.markPaymentFailed(placed.body.order.id, { reason: 'late duplicate' });

    const row = await db('orders').where({ id: placed.body.order.id }).first();
    expect(row.status).toBe('paid'); // not flipped to payment_failed
    const afterSecond = await db('products').where({ id: product.id }).first();
    expect(afterSecond.stock_quantity).toBe(afterFirst.stock_quantity); // no double release
  });
});

describe('payment reconciliation (missed webhook recovery)', () => {
  // Webhooks can be missed: the tunnel dies, the server restarts, the endpoint
  // is briefly unreachable. Reading a pending order therefore also asks the
  // provider directly. These tests pin the safety properties; the happy path
  // needs a live Stripe account and is covered by manual verification.
  const payments = require('../../src/modules/payments/payments.service');

  test('does nothing when Stripe is not configured', async () => {
    const result = await payments.reconcilePendingPayment(
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result.reconciled).toBe(false);
    expect(result.reason).toBe('stripe not configured');
  });

  test('an order with no pending payment is left alone', async () => {
    const product = await db('products').where('stock_quantity', '>=', 1).first();
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 1 });
    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', (added.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '))
      .send({
        email: `reconcile-${unique}@itest.local`,
        shippingMethodId: 1,
        shippingAddress: ADDRESS,
      });

    // No PaymentIntent was ever created for this order.
    const result = await payments.reconcilePendingPayment(placed.body.order.id);
    expect(result.reconciled).toBe(false);

    // Reading it back still works and the order is untouched.
    const read = await request(app)
      .get(`/api/v1/orders/${placed.body.order.reference}`)
      .query({ email: `reconcile-${unique}@itest.local` });
    expect(read.status).toBe(200);
    expect(read.body.order.status).toBe('pending_payment');
  });

  test('the idempotency key is keyed on the intent, so a late webhook collides', async () => {
    const key = `reconcile:pi_collision_${unique}`;
    expect(await payments.claimEvent(key, 'queue', {})).toBe(true);
    expect(await payments.claimEvent(key, 'queue', {})).toBe(false);
  });
});

describe('order fulfilment', () => {
  const orders = require('../../src/modules/orders/orders.service');

  async function paidOrder() {
    const product = await db('products').where('stock_quantity', '>=', 1).first();
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product.id, quantity: 1 });
    const placed = await request(app)
      .post('/api/v1/checkout')
      .set('Cookie', (added.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '))
      .send({
        email: `fulfil-${Date.now()}@itest.local`,
        shippingMethodId: 1,
        shippingAddress: ADDRESS,
      });
    await orders.markPaid(placed.body.order.id);
    return placed.body.order.id;
  }

  test('an order advances paid → processing → shipped → delivered', async () => {
    const id = await paidOrder();
    for (const status of ['processing', 'shipped', 'delivered']) {
      const row = await orders.updateFulfilment(id, { status });
      expect(row.status).toBe(status);
    }
    const final = await orders.getOrderById(id);
    expect(final.timeline.map((t) => t.status)).toEqual([
      'pending_payment', 'paid', 'processing', 'shipped', 'delivered',
    ]);
  });

  test('a tracking number is recorded and surfaced', async () => {
    const id = await paidOrder();
    await orders.updateFulfilment(id, { status: 'processing' });
    await orders.updateFulfilment(id, { status: 'shipped', trackingNumber: 'EE123456789' });
    const order = await orders.getOrderById(id);
    expect(order.trackingNumber).toBe('EE123456789');
    expect(order.shippedAt).toBeTruthy();
  });

  test('transitions are whitelisted, so an order cannot skip or go backwards', async () => {
    const id = await paidOrder();
    // paid -> delivered skips two steps
    await expect(orders.updateFulfilment(id, { status: 'delivered' })).rejects.toThrow(/cannot become/);
    await orders.updateFulfilment(id, { status: 'processing' });
    // and it cannot go back
    await expect(orders.updateFulfilment(id, { status: 'processing' })).rejects.toThrow(/cannot become/);
  });

  test('a shipped order can no longer be cancelled', async () => {
    const id = await paidOrder();
    await orders.updateFulfilment(id, { status: 'processing' });
    await orders.updateFulfilment(id, { status: 'shipped' });
    const order = await orders.getOrderById(id);
    expect(order.canCancel).toBe(false);
    await expect(orders.cancelOrder(id, { byAdmin: true })).rejects.toThrow(/cannot be cancelled/);
  });

  test('staff actions are written to the audit log', async () => {
    const id = await paidOrder();
    await orders.updateFulfilment(id, { status: 'processing', note: 'Picked' });
    const entries = await db('audit_logs').where({ entity: 'orders', entity_id: id });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].action).toBe('order.processing');
  });

  test('the fulfilment endpoint is closed to customers', async () => {
    const id = await paidOrder();
    const order = await orders.getOrderById(id);
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `notstaff-${Date.now()}@itest.local`,
      password: 'Passw0rd1',
      name: 'Not Staff',
      captchaToken: 'ok',
    });
    const res = await request(app)
      .patch(`/api/v1/orders/${order.reference}/fulfilment`)
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ status: 'shipped' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Insufficient permissions/);
  });
});
