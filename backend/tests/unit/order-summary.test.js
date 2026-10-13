const { serializeOrder, generateReference } = require('../../src/modules/orders/orders.service');
const { money, formatPrice } = require('../../src/lib/money');

const orderRow = (overrides = {}) => ({
  id: 'order-1',
  reference: 'VM-ABC123',
  status: 'paid',
  email: 'buyer@example.com',
  currency: 'EUR',
  subtotal_cents: 4299000,
  shipping_cents: 49900,
  total_cents: 4348900,
  created_at: new Date('2026-10-01T10:00:00Z'),
  paid_at: new Date('2026-10-01T10:01:00Z'),
  shipped_at: null,
  cancelled_at: null,
  cancel_reason: null,
  tracking_number: null,
  shipping_method_id: 3,
  shipping_address_enc: null,
  ...overrides,
});

const itemRow = (overrides = {}) => ({
  id: 'item-1',
  product_id: 'prod-1',
  name_snapshot: 'Tesla Model 3 Long Range',
  slug_snapshot: 'tesla-model-3-long-range',
  image_snapshot: '/uploads/products/tesla.svg',
  price_cents_snapshot: 4299000,
  quantity: 1,
  line_total_cents: 4299000,
  ...overrides,
});

describe('order summary calculations', () => {
  test('subtotal plus shipping equals the total', () => {
    const o = serializeOrder(orderRow(), [itemRow()]);
    expect(o.subtotal.cents + o.shipping.cents).toBe(o.total.cents);
    expect(o.total.cents).toBe(4348900);
  });

  test('line totals sum to the subtotal', () => {
    const items = [
      itemRow({ price_cents_snapshot: 64900, quantity: 2, line_total_cents: 129800 }),
      itemRow({ id: 'item-2', price_cents_snapshot: 13900, quantity: 3, line_total_cents: 41700 }),
    ];
    const subtotal = items.reduce((s, i) => s + i.line_total_cents, 0);
    const o = serializeOrder(
      orderRow({ subtotal_cents: subtotal, shipping_cents: 499, total_cents: subtotal + 499 }),
      items
    );
    expect(o.items.reduce((s, i) => s + i.lineTotal.cents, 0)).toBe(o.subtotal.cents);
  });

  test('free shipping is represented as zero, not omitted', () => {
    const o = serializeOrder(
      orderRow({ shipping_cents: 0, total_cents: 4299000 }),
      [itemRow()]
    );
    expect(o.shipping.cents).toBe(0);
    expect(o.shipping.formatted).toMatch(/0\.00/);
    expect(o.total.cents).toBe(o.subtotal.cents);
  });

  test('prices come from the order snapshot, not the live catalog', () => {
    // The product has since been repriced; the order must not change.
    const o = serializeOrder(orderRow(), [
      itemRow({ name_snapshot: 'Tesla Model 3 (2026 price)', price_cents_snapshot: 4299000 }),
    ]);
    expect(o.items[0].name).toBe('Tesla Model 3 (2026 price)');
    expect(o.items[0].unitPrice.cents).toBe(4299000);
  });

  test('exposes shipping method and ETA when present', () => {
    const o = serializeOrder(orderRow(), [itemRow()], [], {
      code: 'vehicle_transport',
      name: 'Vehicle transport',
      eta_days_min: 10,
      eta_days_max: 21,
    });
    expect(o.shippingMethod).toEqual({
      code: 'vehicle_transport',
      name: 'Vehicle transport',
      etaDays: [10, 21],
    });
  });

  test('builds a status timeline from recorded events', () => {
    const o = serializeOrder(orderRow(), [itemRow()], [
      { status: 'pending_payment', note: 'Order placed', created_at: new Date('2026-10-01T10:00:00Z') },
      { status: 'paid', note: 'Payment received', created_at: new Date('2026-10-01T10:01:00Z') },
    ]);
    expect(o.timeline.map((t) => t.status)).toEqual(['pending_payment', 'paid']);
  });

  test('cancellable only before the order is processed', () => {
    expect(serializeOrder(orderRow({ status: 'pending_payment' })).canCancel).toBe(true);
    expect(serializeOrder(orderRow({ status: 'paid' })).canCancel).toBe(true);
    expect(serializeOrder(orderRow({ status: 'shipped' })).canCancel).toBe(false);
    expect(serializeOrder(orderRow({ status: 'cancelled' })).canCancel).toBe(false);
  });
});

describe('money formatting', () => {
  test('renders integer cents as currency', () => {
    expect(formatPrice(499)).toMatch(/4\.99/);
    expect(formatPrice(4299000)).toMatch(/42,990/);
  });

  test('money() returns cents, currency and a formatted string together', () => {
    expect(money(1999)).toEqual({
      cents: 1999,
      currency: 'EUR',
      formatted: expect.stringContaining('19.99'),
    });
  });
});

describe('order references', () => {
  test('are prefixed, readable and unambiguous', () => {
    const ref = generateReference();
    expect(ref).toMatch(/^VM-[2-9A-HJ-NP-Z]{6}$/); // no 0/1/I/O to avoid misreading
  });

  test('do not collide across many draws', () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateReference()));
    expect(refs.size).toBe(500);
  });
});
