const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');

const app = createApp();

describe('GET /api/v1/categories', () => {
  test('returns the tree with product counts', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const roots = res.body.categories;
    expect(roots.map((c) => c.slug).sort()).toEqual(['charging-accessories', 'electric-cars']);
    const cars = roots.find((c) => c.slug === 'electric-cars');
    expect(cars.children.length).toBeGreaterThanOrEqual(4);
    expect(cars.productCount).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/products (browse + faceted search)', () => {
  test('paginates with defaults', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(12);
    expect(res.body.total).toBeGreaterThan(30);
    expect(res.body.totalPages).toBeGreaterThan(1);
  });

  test('parent category includes descendant products', async () => {
    const res = await request(app).get('/api/v1/products?category=electric-cars&perPage=60');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(20);
    expect(res.body.items.every((p) => p.ev !== null)).toBe(true);
  });

  test('brand + price range filters combine', async () => {
    const res = await request(app).get(
      '/api/v1/products?brand=tesla&minPrice=40000&maxPrice=50000'
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const p of res.body.items) {
      expect(p.brand.slug).toBe('tesla');
      expect(p.price.cents).toBeGreaterThanOrEqual(4000000);
      expect(p.price.cents).toBeLessThanOrEqual(5000000);
    }
  });

  test('facet counts: the brand facet ignores its own filter', async () => {
    const res = await request(app).get('/api/v1/products?brand=tesla');
    const brandSlugs = res.body.facets.brands.map((b) => b.slug);
    expect(brandSlugs.length).toBeGreaterThan(1); // other brands still offered
    expect(res.body.facets.price).toHaveProperty('minCents');
  });

  test('sorts by price ascending', async () => {
    const res = await request(app).get('/api/v1/products?sort=price_asc&perPage=20');
    const prices = res.body.items.map((p) => p.price.cents);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  test('sorts by rating descending', async () => {
    const res = await request(app).get('/api/v1/products?sort=rating&perPage=20');
    const ratings = res.body.items.map((p) => p.rating.average);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  test('full-text search ranks by relevance', async () => {
    const res = await request(app).get('/api/v1/products?q=long+range+tesla');
    expect(res.status).toBe(200);
    expect(res.body.sort).toBe('relevance');
    expect(res.body.items[0].name).toMatch(/Tesla.*Long Range/);
  });

  test('in-stock filter hides depleted products', async () => {
    const product = await db('products').where('is_active', true).first();
    await db('products').where({ id: product.id }).update({ stock_quantity: 0 });
    const res = await request(app).get('/api/v1/products?inStock=true&perPage=60');
    expect(res.body.items.find((p) => p.id === product.id)).toBeUndefined();
    await db('products').where({ id: product.id }).update({ stock_quantity: 5 });
  });
});

describe('GET /api/v1/products/suggest', () => {
  test('suggests while typing, tolerating typos', async () => {
    const res = await request(app).get('/api/v1/products/suggest?q=tesle');
    expect(res.status).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions[0].name).toMatch(/Tesla/);
    expect(res.body.suggestions[0]).toHaveProperty('image');
  });

  test('requires a query', async () => {
    expect((await request(app).get('/api/v1/products/suggest')).status).toBe(400);
  });
});

describe('GET /api/v1/products/:slug', () => {
  test('returns full detail with images and related products', async () => {
    const res = await request(app).get('/api/v1/products/tesla-model-3-long-range');
    expect(res.status).toBe(200);
    const p = res.body.product;
    expect(p.images.length).toBeGreaterThan(0);
    expect(p.weight.kg).toBeGreaterThan(0);
    expect(p.weight.lb).toBeCloseTo(p.weight.kg * 2.20462, 0);
    expect(p.related.length).toBeGreaterThan(0);
    expect(p.related.every((r) => r.slug !== p.slug)).toBe(true);
  });

  test('404 for unknown product', async () => {
    expect((await request(app).get('/api/v1/products/no-such-car')).status).toBe(404);
  });
});

describe('database integrity (ACID consistency)', () => {
  test('CHECK constraint rejects negative prices', async () => {
    const cat = await db('categories').whereNotNull('parent_id').first();
    const brand = await db('brands').first();
    await expect(
      db('products').insert({
        name: 'Broken',
        slug: `broken-${Date.now()}`,
        description: 'x',
        price_cents: -100,
        category_id: cat.id,
        brand_id: brand.id,
      })
    ).rejects.toThrow(/products_price_nonnegative/);
  });

  test('foreign keys reject orphan images', async () => {
    await expect(
      db('product_images').insert({
        product_id: '00000000-0000-0000-0000-000000000000',
        file_path: '/uploads/x.svg',
        alt_text: 'x',
      })
    ).rejects.toThrow();
  });
});
