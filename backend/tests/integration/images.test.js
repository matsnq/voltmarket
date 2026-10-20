// "Stored and served in multiple sizes": each product has a full-size asset
// and a smaller card-sized variant, and each view asks for the one it needs.
const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../../src/lib/db');

const app = createApp();

describe('product image variants', () => {
  test('every product image row stores both a full-size and a thumbnail path', async () => {
    const rows = await db('product_images').select('file_path', 'thumb_path', 'width', 'thumb_width');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.file_path).toMatch(/\.svg$/);
      expect(r.thumb_path).toMatch(/-thumb\.svg$/);
      // The variant is genuinely smaller, not the same asset relabelled.
      expect(r.thumb_width).toBeLessThan(r.width);
    }
  });

  test('the product detail payload exposes both, with intrinsic dimensions', async () => {
    const list = await request(app).get('/api/v1/products?perPage=1');
    const slug = list.body.items[0].slug;
    const res = await request(app).get(`/api/v1/products/${slug}`);

    const img = res.body.product.images[0];
    expect(img.url).toMatch(/\.svg$/);
    expect(img.thumbUrl).toMatch(/-thumb\.svg$/);
    expect(img.url).not.toBe(img.thumbUrl);
    // Declared so the browser can reserve space instead of reflowing.
    expect(img.width).toBe(740);
    expect(img.height).toBe(420);
    expect(img.thumbWidth).toBe(240);
    expect(img.thumbHeight).toBe(140);
    expect(img.alt).toBeTruthy();
  });

  test('listing cards carry the thumbnail alongside the full-size url', async () => {
    const res = await request(app).get('/api/v1/products?perPage=3');
    for (const item of res.body.items) {
      const img = item.images[0];
      expect(img.thumbUrl).toMatch(/-thumb\.svg$/);
      expect(img.url).not.toBe(img.thumbUrl);
    }
  });

  test('search suggestions use the thumbnail — they render at 40px', async () => {
    const res = await request(app).get('/api/v1/products/suggest?q=tesla');
    const withImages = res.body.suggestions.filter((s) => s.image);
    expect(withImages.length).toBeGreaterThan(0);
    for (const s of withImages) expect(s.image).toMatch(/-thumb\.svg$/);
  });

  test('cart lines use the thumbnail too', async () => {
    const list = await request(app).get('/api/v1/products?perPage=1');
    const added = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: list.body.items[0].id, quantity: 1 });
    expect(added.status).toBe(201);
    expect(added.body.cart.items[0].image).toMatch(/-thumb\.svg$/);
  });

  test('every image has descriptive alt text', async () => {
    const rows = await db('product_images').select('alt_text');
    for (const r of rows) {
      expect(r.alt_text).toBeTruthy();
      // "image" or "photo" alone is not descriptive.
      expect(r.alt_text.trim().split(/\s+/).length).toBeGreaterThan(2);
    }
  });
});
