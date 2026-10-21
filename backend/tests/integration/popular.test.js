// The home page's "most popular" row. The ranking matters less than the two
// properties a landing page depends on: it is never one category, and it
// never shows something nobody can buy.
const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');

const app = createApp();

describe('GET /api/v1/products/popular', () => {
  test('returns twelve products by default', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
  });

  test('spans several categories rather than filling up with one', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    const categories = new Set(res.body.items.map((p) => p.category.slug));
    // Ranking by score alone returns a page of cars, because they attract the
    // most reviews. The round-robin is the point of this endpoint.
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  test('every item is purchasable — active and in stock', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    for (const item of res.body.items) {
      expect(item.inStock).toBe(true);
      const row = await db('products').where({ id: item.id }).first();
      expect(row.is_active).toBe(true);
      expect(row.stock_quantity).toBeGreaterThan(0);
    }
  });

  test('items carry what a product card needs', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    const p = res.body.items[0];
    expect(p.name).toBeTruthy();
    expect(p.slug).toBeTruthy();
    expect(p.price.formatted).toMatch(/€/);
    expect(p.rating).toHaveProperty('average');
    expect(p.images[0].thumbUrl).toMatch(/-thumb\.svg$/);
  });

  test('a product that has actually sold outranks one that has not', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    const sold = await db('order_items')
      .join('orders', 'orders.id', 'order_items.order_id')
      .whereIn('orders.status', ['paid', 'processing', 'shipped', 'delivered'])
      .groupBy('order_items.product_id')
      .select('order_items.product_id')
      .sum('order_items.quantity as units');

    const unitsFor = Object.fromEntries(sold.map((s) => [s.product_id, Number(s.units)]));
    const withSales = res.body.items.filter((p) => unitsFor[p.id]);
    // Only meaningful while some seeded order has been paid for.
    if (withSales.length === 0) return;

    const positions = res.body.items.map((p) => p.id);
    for (const p of withSales) {
      const rivals = res.body.items.filter(
        (o) => !unitsFor[o.id] && o.category.slug === p.category.slug
      );
      for (const rival of rivals) {
        expect(positions.indexOf(p.id)).toBeLessThan(positions.indexOf(rival.id));
      }
    }
  });

  test('the limit is honoured and clamped', async () => {
    expect((await request(app).get('/api/v1/products/popular?limit=4')).body.items).toHaveLength(4);
    // Above the cap it clamps rather than erroring or returning the catalogue.
    const big = await request(app).get('/api/v1/products/popular?limit=999');
    expect(big.status).toBe(200);
    expect(big.body.items.length).toBeLessThanOrEqual(24);
    // Nonsense falls back to the default instead of 500ing.
    expect((await request(app).get('/api/v1/products/popular?limit=abc')).status).toBe(200);
  });

  test('"popular" is not swallowed by the /products/:slug route', async () => {
    const res = await request(app).get('/api/v1/products/popular');
    expect(res.body.items).toBeDefined();
    expect(res.body.product).toBeUndefined();
  });
});
