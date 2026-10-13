const { calculateTotals, serializeLine } = require('../../src/modules/cart/cart.service');

// Lines as cartLines() returns them, so the unit under test sees real shapes.
const line = (overrides = {}) => ({
  id: 'line-1',
  quantity: 1,
  product_id: 'prod-1',
  name: 'Wallbox Pulsar Plus 11 kW',
  slug: 'wallbox-pulsar-plus-11-kw',
  price_cents: 64900,
  currency: 'EUR',
  stock_quantity: 10,
  is_active: true,
  image: '/uploads/products/wallbox.svg',
  image_alt: 'Wallbox charger',
  ...overrides,
});

describe('cart total calculations', () => {
  test('an empty cart totals zero', () => {
    const totals = calculateTotals([]);
    expect(totals.itemCount).toBe(0);
    expect(totals.subtotal.cents).toBe(0);
    expect(totals.total.cents).toBe(0);
  });

  test('multiplies unit price by quantity', () => {
    const totals = calculateTotals([line({ quantity: 3 })]);
    expect(totals.itemCount).toBe(3);
    expect(totals.subtotal.cents).toBe(194700);
  });

  test('sums mixed lines', () => {
    const totals = calculateTotals([
      line({ price_cents: 64900, quantity: 2 }),
      line({ id: 'line-2', price_cents: 13900, quantity: 1 }),
    ]);
    expect(totals.itemCount).toBe(3);
    expect(totals.subtotal.cents).toBe(143700);
  });

  test('adds shipping to the total but never to the subtotal', () => {
    const totals = calculateTotals([line({ price_cents: 10000, quantity: 2 })], 499);
    expect(totals.subtotal.cents).toBe(20000);
    expect(totals.shipping.cents).toBe(499);
    expect(totals.total.cents).toBe(20499);
  });

  test('money stays exact across many lines (integer cents, no float drift)', () => {
    // 10 × €0.10 must be exactly €1.00 — the reason prices are integers.
    const lines = Array.from({ length: 10 }, (_, i) =>
      line({ id: `l${i}`, price_cents: 10, quantity: 1 })
    );
    expect(calculateTotals(lines).subtotal.cents).toBe(100);
  });

  test('formats money for display', () => {
    const totals = calculateTotals([line({ price_cents: 4299000, quantity: 1 })]);
    expect(totals.subtotal.formatted).toContain('42,990');
  });
});

describe('cart line serialization', () => {
  test('exposes the information the cart page needs', () => {
    const item = serializeLine(line({ quantity: 2 }));
    expect(item.name).toBe('Wallbox Pulsar Plus 11 kW');
    expect(item.image).toMatch(/^\/uploads\//);
    expect(item.unitPrice.cents).toBe(64900);
    expect(item.lineTotal.cents).toBe(129800);
    expect(item.quantity).toBe(2);
  });

  test('flags a line that exceeds available stock rather than silently capping it', () => {
    const item = serializeLine(line({ quantity: 5, stock_quantity: 2 }));
    expect(item.exceedsStock).toBe(true);
    expect(item.quantity).toBe(5); // shopper still sees what they asked for
  });

  test('flags an out-of-stock or delisted product as unavailable', () => {
    expect(serializeLine(line({ stock_quantity: 0 })).unavailable).toBe(true);
    expect(serializeLine(line({ is_active: false })).unavailable).toBe(true);
    expect(serializeLine(line()).unavailable).toBe(false);
  });
});
