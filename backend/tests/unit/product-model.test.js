const { serializeProduct } = require('../../src/modules/catalog/catalog.service');

const row = {
  id: 'aaaa1111-2222-3333-4444-555566667777',
  name: 'Test EV',
  slug: 'test-ev',
  description: 'A test electric vehicle',
  price_cents: 4299000,
  currency: 'EUR',
  stock_quantity: 5,
  category_id: 2,
  category_name: 'Sedans',
  category_slug: 'sedans',
  brand_id: 1,
  brand_name: 'Tesla',
  brand_slug: 'tesla',
  weight_kg: '1765.00',
  weight_lb: '3891.15',
  length_mm: 4720,
  width_mm: 1848,
  height_mm: 1442,
  length_in: '185.8',
  width_in: '72.8',
  height_in: '56.8',
  range_km: 513,
  battery_kwh: '57.5',
  motor_power_kw: 208,
  attributes: { seats: 5 },
  rating_avg: '4.30',
  rating_count: 12,
  created_at: new Date('2026-07-01'),
};

describe('product data model serialization', () => {
  const product = serializeProduct(row, [
    { file_path: '/uploads/products/test-ev.svg', alt_text: 'Test EV photo', is_primary: true },
  ]);

  test('exposes every required catalog field', () => {
    // id, name, description, price, stock, category, brand, images, weight/dims
    expect(product.id).toBe(row.id);
    expect(product.name).toBe('Test EV');
    expect(product.description).toBe('A test electric vehicle');
    expect(product.stockQuantity).toBe(5);
    expect(product.category.slug).toBe('sedans');
    expect(product.brand.name).toBe('Tesla');
    expect(product.images).toHaveLength(1);
    expect(product.images[0].url).toMatch(/^\/uploads\/products\//);
  });

  test('formats money from integer cents', () => {
    expect(product.price.cents).toBe(4299000);
    expect(product.price.formatted).toContain('42,990');
  });

  test('provides weight and dimensions in metric AND imperial', () => {
    expect(product.weight).toEqual({ kg: 1765, lb: 3891.15 });
    expect(product.dimensions.metric.lengthMm).toBe(4720);
    expect(product.dimensions.imperial.lengthIn).toBeCloseTo(185.8);
  });

  test('exposes EV attributes and rating', () => {
    expect(product.ev).toEqual({ rangeKm: 513, batteryKwh: 57.5, motorPowerKw: 208 });
    expect(product.rating).toEqual({ average: 4.3, count: 12 });
  });

  test('inStock reflects stock quantity', () => {
    expect(product.inStock).toBe(true);
    const outOfStock = serializeProduct({ ...row, stock_quantity: 0 });
    expect(outOfStock.inStock).toBe(false);
  });

  test('accessories without EV specs serialize with ev = null', () => {
    const accessory = serializeProduct({ ...row, range_km: null });
    expect(accessory.ev).toBeNull();
  });
});
