const db = require('../../lib/db');
const { cached } = require('../../lib/cache');
const { formatPrice } = require('../../lib/money');
const { HttpError } = require('../../middleware/errorHandler');

function serializeProduct(row, images = []) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: {
      cents: row.price_cents,
      currency: row.currency,
      formatted: formatPrice(row.price_cents, row.currency),
    },
    stockQuantity: row.stock_quantity,
    inStock: row.stock_quantity > 0,
    category: row.category_name
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
      : { id: row.category_id },
    brand: row.brand_name
      ? { id: row.brand_id, name: row.brand_name, slug: row.brand_slug }
      : { id: row.brand_id },
    weight: row.weight_kg !== null ? { kg: Number(row.weight_kg), lb: Number(row.weight_lb) } : null,
    dimensions:
      row.length_mm !== null
        ? {
            metric: { lengthMm: row.length_mm, widthMm: row.width_mm, heightMm: row.height_mm },
            imperial: {
              lengthIn: Number(row.length_in),
              widthIn: Number(row.width_in),
              heightIn: Number(row.height_in),
            },
          }
        : null,
    ev:
      row.range_km !== null
        ? {
            rangeKm: row.range_km,
            batteryKwh: row.battery_kwh !== null ? Number(row.battery_kwh) : null,
            motorPowerKw: row.motor_power_kw,
          }
        : null,
    attributes: row.attributes || {},
    rating: { average: Number(row.rating_avg), count: row.rating_count },
    images: images.map((img) => ({
      url: img.file_path,
      // Card-sized variant. Null for anything uploaded before variants
      // existed, so every consumer falls back to the full-size file.
      thumbUrl: img.thumb_path || img.file_path,
      width: img.width || null,
      height: img.height || null,
      thumbWidth: img.thumb_width || null,
      thumbHeight: img.thumb_height || null,
      alt: img.alt_text,
      primary: img.is_primary,
    })),
    createdAt: row.created_at,
  };
}

// ---------- Categories ----------

async function categoryTree() {
  return cached('cache:categories', 60, async () => {
    const [rows, counts] = await Promise.all([
      db('categories').orderBy(['sort_order', 'name']),
      db('products')
        .where('is_active', true)
        .groupBy('category_id')
        .select('category_id')
        .count('id as n'),
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c.category_id, Number(c.n)]));
    const byParent = new Map();
    for (const row of rows) {
      const list = byParent.get(row.parent_id) || [];
      list.push(row);
      byParent.set(row.parent_id, list);
    }
    const build = (parentId) =>
      (byParent.get(parentId) || []).map((row) => {
        const children = build(row.id);
        const own = countMap[row.id] || 0;
        const total = own + children.reduce((sum, c) => sum + c.productCount, 0);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          productCount: total,
          children,
        };
      });
    return build(null);
  });
}

// Resolve a category slug to itself + all descendant ids.
async function categoryIdsForSlug(slugValue) {
  const rows = await db('categories').select('id', 'slug', 'parent_id');
  const root = rows.find((r) => r.slug === slugValue);
  if (!root) throw new HttpError(404, 'Category not found');
  const ids = [root.id];
  let frontier = [root.id];
  while (frontier.length) {
    const next = rows.filter((r) => frontier.includes(r.parent_id)).map((r) => r.id);
    ids.push(...next);
    frontier = next;
  }
  return ids;
}

// ---------- Product listing with faceted search ----------

function applyFilters(qb, f, { skip = [] } = {}) {
  qb.where('products.is_active', true);
  if (f.q && !skip.includes('q')) {
    qb.whereRaw("products.search_vector @@ websearch_to_tsquery('english', ?)", [f.q]);
  }
  if (f.categoryIds && !skip.includes('category')) {
    qb.whereIn('products.category_id', f.categoryIds);
  }
  if (f.brandSlugs && !skip.includes('brand')) {
    qb.whereIn(
      'products.brand_id',
      db('brands').select('id').whereIn('slug', f.brandSlugs)
    );
  }
  if (f.minPrice !== undefined && !skip.includes('price')) {
    qb.where('products.price_cents', '>=', Math.round(f.minPrice * 100));
  }
  if (f.maxPrice !== undefined && !skip.includes('price')) {
    qb.where('products.price_cents', '<=', Math.round(f.maxPrice * 100));
  }
  if (f.minRating !== undefined && !skip.includes('rating')) {
    qb.where('products.rating_avg', '>=', f.minRating);
  }
  if (f.minRange !== undefined) {
    qb.where('products.range_km', '>=', f.minRange);
  }
  if (f.inStock) {
    qb.where('products.stock_quantity', '>', 0);
  }
  return qb;
}

async function listProducts(params) {
  const filters = { ...params };
  if (params.category) filters.categoryIds = await categoryIdsForSlug(params.category);
  if (params.brand) filters.brandSlugs = params.brand.split(',');

  const sort = params.sort || (params.q ? 'relevance' : 'newest');

  const base = () => applyFilters(db('products'), filters);

  const listQuery = base()
    .leftJoin('brands', 'brands.id', 'products.brand_id')
    .leftJoin('categories', 'categories.id', 'products.category_id')
    .select(
      'products.*',
      'brands.name as brand_name',
      'brands.slug as brand_slug',
      'categories.name as category_name',
      'categories.slug as category_slug'
    );

  if (sort === 'relevance' && filters.q) {
    listQuery.select(
      db.raw("ts_rank(products.search_vector, websearch_to_tsquery('english', ?)) as rank", [
        filters.q,
      ])
    );
    listQuery.orderBy([{ column: 'rank', order: 'desc' }, { column: 'products.rating_avg', order: 'desc' }]);
  } else if (sort === 'price_asc') listQuery.orderBy('products.price_cents', 'asc');
  else if (sort === 'price_desc') listQuery.orderBy('products.price_cents', 'desc');
  else if (sort === 'rating')
    listQuery.orderBy([
      { column: 'products.rating_avg', order: 'desc' },
      { column: 'products.rating_count', order: 'desc' },
    ]);
  else listQuery.orderBy('products.created_at', 'desc');

  const offset = (params.page - 1) * params.perPage;
  listQuery.limit(params.perPage).offset(offset);

  // Facets: each dimension is counted with every filter applied EXCEPT its
  // own, so users can widen a facet they already narrowed.
  const [rows, [{ count: total }], brandFacets, categoryFacets, priceBounds] = await Promise.all([
    listQuery,
    base().count('* as count'),
    applyFilters(db('products'), filters, { skip: ['brand'] })
      .join('brands', 'brands.id', 'products.brand_id')
      .groupBy('brands.id')
      .select('brands.name', 'brands.slug')
      .count('products.id as count')
      .orderBy('brands.name'),
    applyFilters(db('products'), filters, { skip: ['category'] })
      .join('categories', 'categories.id', 'products.category_id')
      .groupBy('categories.id')
      .select('categories.name', 'categories.slug')
      .count('products.id as count')
      .orderBy('categories.name'),
    applyFilters(db('products'), filters, { skip: ['price'] })
      .min('price_cents as min')
      .max('price_cents as max')
      .first(),
  ]);

  const images = rows.length
    ? await db('product_images')
        .whereIn('product_id', rows.map((r) => r.id))
        .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'sort_order' }])
    : [];
  const imagesByProduct = new Map();
  for (const img of images) {
    const list = imagesByProduct.get(img.product_id) || [];
    list.push(img);
    imagesByProduct.set(img.product_id, list);
  }

  return {
    items: rows.map((row) => serializeProduct(row, imagesByProduct.get(row.id) || [])),
    total: Number(total),
    page: params.page,
    perPage: params.perPage,
    totalPages: Math.max(1, Math.ceil(Number(total) / params.perPage)),
    sort,
    facets: {
      brands: brandFacets.map((b) => ({ name: b.name, slug: b.slug, count: Number(b.count) })),
      categories: categoryFacets.map((c) => ({ name: c.name, slug: c.slug, count: Number(c.count) })),
      price:
        priceBounds && priceBounds.min !== null
          ? { minCents: Number(priceBounds.min), maxCents: Number(priceBounds.max) }
          : null,
    },
  };
}

// ---------- Live search suggestions (pg_trgm, typo tolerant) ----------

async function suggest(q) {
  return cached(`cache:suggest:${q.toLowerCase()}`, 30, async () => {
    const rows = await db('products')
      .where('products.is_active', true)
      .andWhere((qb) =>
        qb
          .whereILike('products.name', `%${q}%`)
          .orWhereRaw('similarity(products.name, ?) > 0.15', [q])
      )
      .leftJoin('product_images', function join() {
        this.on('product_images.product_id', 'products.id').andOnVal(
          'product_images.is_primary',
          true
        );
      })
      .select(
        'products.name',
        'products.slug',
        'products.price_cents',
        'products.currency',
        db.raw('COALESCE(product_images.thumb_path, product_images.file_path) as image')
      )
      .orderByRaw('similarity(products.name, ?) DESC', [q])
      .limit(8);
    return rows.map((r) => ({
      name: r.name,
      slug: r.slug,
      price: { cents: r.price_cents, formatted: formatPrice(r.price_cents, r.currency) },
      image: r.image,
    }));
  });
}

// ---------- Product detail + related ----------

async function getProduct(slugValue) {
  const row = await db('products')
    .leftJoin('brands', 'brands.id', 'products.brand_id')
    .leftJoin('categories', 'categories.id', 'products.category_id')
    .select(
      'products.*',
      'brands.name as brand_name',
      'brands.slug as brand_slug',
      'categories.name as category_name',
      'categories.slug as category_slug'
    )
    .where('products.slug', slugValue)
    .where('products.is_active', true)
    .first();
  if (!row) throw new HttpError(404, 'Product not found');

  const [images, related] = await Promise.all([
    db('product_images')
      .where('product_id', row.id)
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'sort_order' }]),
    db('products')
      .leftJoin('brands', 'brands.id', 'products.brand_id')
      .leftJoin('categories', 'categories.id', 'products.category_id')
      .leftJoin('product_images', function join() {
        this.on('product_images.product_id', 'products.id').andOnVal(
          'product_images.is_primary',
          true
        );
      })
      .select(
        'products.*',
        'brands.name as brand_name',
        'brands.slug as brand_slug',
        'categories.name as category_name',
        'categories.slug as category_slug',
        'product_images.file_path as primary_image',
        'product_images.thumb_path as primary_thumb',
        'product_images.alt_text as primary_alt'
      )
      .where('products.category_id', row.category_id)
      .whereNot('products.id', row.id)
      .where('products.is_active', true)
      .orderBy('products.rating_avg', 'desc')
      .limit(4),
  ]);

  return {
    ...serializeProduct(row, images),
    related: related.map((r) =>
      serializeProduct(
        r,
        r.primary_image
          ? [{
              file_path: r.primary_image,
              thumb_path: r.primary_thumb,
              width: 740,
              height: 420,
              thumb_width: 240,
              thumb_height: 140,
              alt_text: r.primary_alt,
              is_primary: true,
            }]
          : []
      )
    ),
  };
}

// ---------- Most popular ----------
//
// "Popular" is scored from what the shop actually knows, which is two
// different signals of very different strength:
//
//   units sold   a real purchase, but only a handful of products have one
//   reviews      every product has some, so it separates the rest
//
// Units are weighted heavily so anything genuinely selling outranks a
// well-reviewed product that nobody has bought; review count then breaks the
// tie among the rest, with the average rating last so a single glowing review
// cannot beat twenty good ones.
//
// The result is then spread across sub-categories round-robin. Ranking purely
// by score returns a page of sedans, because cars attract the most reviews —
// and a landing page that shows one category is not a shop window.
const POPULAR_SOLD_WEIGHT = 3;
const POPULAR_REVIEW_WEIGHT = 0.5;

async function listPopular({ limit = 12 } = {}) {
  const sold = db('order_items')
    .join('orders', 'orders.id', 'order_items.order_id')
    // Only money that was actually collected counts as a sale.
    .whereIn('orders.status', ['paid', 'processing', 'shipped', 'delivered'])
    .groupBy('order_items.product_id')
    .select('order_items.product_id')
    .sum('order_items.quantity as units')
    .as('sold');

  const rows = await db('products')
    .join('brands', 'brands.id', 'products.brand_id')
    .join('categories', 'categories.id', 'products.category_id')
    .leftJoin(sold, 'sold.product_id', 'products.id')
    .leftJoin('product_images', function join() {
      this.on('product_images.product_id', 'products.id').andOnVal(
        'product_images.is_primary',
        true
      );
    })
    .where('products.is_active', true)
    .where('products.stock_quantity', '>', 0)
    .select(
      'products.*',
      'brands.name as brand_name',
      'brands.slug as brand_slug',
      'categories.name as category_name',
      'categories.slug as category_slug',
      'product_images.file_path as primary_image',
      'product_images.thumb_path as primary_thumb',
      'product_images.alt_text as primary_alt',
      db.raw('COALESCE(sold.units, 0)::int as units_sold'),
      // The weights are cast explicitly: Postgres infers a bound parameter's
      // type from its context, so multiplying the integer rating_count by a
      // bare ? made it infer integer and reject 0.5.
      db.raw(
        'COALESCE(sold.units, 0) * ?::numeric + products.rating_count * ?::numeric + products.rating_avg as popularity',
        [POPULAR_SOLD_WEIGHT, POPULAR_REVIEW_WEIGHT]
      )
    )
    .orderBy('popularity', 'desc');

  // Round-robin across sub-categories, preserving score order within each.
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(row.category_slug)) byCategory.set(row.category_slug, []);
    byCategory.get(row.category_slug).push(row);
  }

  const picked = [];
  const queues = [...byCategory.values()];
  while (picked.length < limit && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      if (queue.length) picked.push(queue.shift());
    }
  }

  return picked.map((r) =>
    serializeProduct(
      r,
      r.primary_image
        ? [{
            file_path: r.primary_image,
            thumb_path: r.primary_thumb,
            width: 740,
            height: 420,
            thumb_width: 240,
            thumb_height: 140,
            alt_text: r.primary_alt,
            is_primary: true,
          }]
        : []
    )
  );
}

async function listBrands() {
  return cached('cache:brands', 60, async () => {
    const rows = await db('brands')
      .leftJoin('products', function join() {
        this.on('products.brand_id', 'brands.id').andOnVal('products.is_active', true);
      })
      .groupBy('brands.id')
      .select('brands.id', 'brands.name', 'brands.slug', 'brands.country')
      .count('products.id as count')
      .orderBy('brands.name');
    return rows.map((b) => ({ ...b, count: Number(b.count) }));
  });
}

module.exports = {
  listPopular, categoryTree, listProducts, suggest, getProduct, listBrands, serializeProduct };
