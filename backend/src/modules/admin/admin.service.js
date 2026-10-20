const db = require('../../lib/db');
const { money } = require('../../lib/money');
const { HttpError } = require('../../middleware/errorHandler');

// Every mutation here is recorded. Admin actions on other people's data must
// be attributable after the fact — that is the audit-logging half of
// "principle of least privilege and audit logging".
async function audit(trx, { actorId, action, entity, entityId, meta }) {
  await trx('audit_logs').insert({
    user_id: actorId || null,
    action,
    entity,
    entity_id: entityId ? String(entityId) : null,
    meta: meta ? JSON.stringify(meta) : null,
  });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// A slug must be unique; adding -2, -3 … is friendlier than rejecting the save.
async function uniqueSlug(trx, table, base, ignoreId) {
  let slug = base;
  let n = 1;
  for (;;) {
    const q = trx(table).where({ slug });
    if (ignoreId) q.whereNot('id', ignoreId);
    // eslint-disable-next-line no-await-in-loop
    if (!(await q.first())) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// ---------- Dashboard ----------

async function stats() {
  const [products, lowStock, orders, pendingReviews, users] = await Promise.all([
    db('products').where('is_active', true).count('* as n').first(),
    db('products').where('is_active', true).where('stock_quantity', '<=', 3).count('* as n').first(),
    db('orders')
      .select('status')
      .count('* as n')
      .sum('total_cents as revenue')
      .groupBy('status'),
    db('reviews').where('status', 'pending').count('* as n').first(),
    db('users').where('is_active', true).count('* as n').first(),
  ]);

  const byStatus = Object.fromEntries(orders.map((o) => [o.status, Number(o.n)]));
  // Revenue counts money actually collected, so cancelled and failed orders
  // are excluded rather than inflating the figure.
  const earned = orders
    .filter((o) => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status))
    .reduce((sum, o) => sum + Number(o.revenue || 0), 0);

  const recent = await db('orders')
    .orderBy('created_at', 'desc')
    .limit(5)
    .select('id', 'reference', 'status', 'total_cents', 'created_at');

  return {
    products: Number(products.n),
    lowStock: Number(lowStock.n),
    users: Number(users.n),
    pendingReviews: Number(pendingReviews.n),
    orders: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      awaitingAction: (byStatus.paid || 0) + (byStatus.processing || 0),
    },
    revenue: money(earned),
    recentOrders: recent.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      total: money(o.total_cents),
      placedAt: o.created_at,
    })),
  };
}

// ---------- Products ----------

function serializeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.price_cents,
    price: money(row.price_cents, row.currency),
    stockQuantity: row.stock_quantity,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    lengthMm: row.length_mm,
    widthMm: row.width_mm,
    heightMm: row.height_mm,
    rangeKm: row.range_km,
    batteryKwh: row.battery_kwh === null ? null : Number(row.battery_kwh),
    motorPowerKw: row.motor_power_kw,
    isActive: row.is_active,
    rating: { average: Number(row.rating_avg), count: row.rating_count },
    image: row.image || null,
  };
}

async function listProducts({ q, category, status, page = 1, perPage = 20 } = {}) {
  const base = db('products')
    .leftJoin('categories', 'categories.id', 'products.category_id')
    .leftJoin('brands', 'brands.id', 'products.brand_id');

  const filtered = () => {
    const query = base.clone();
    if (q) query.whereILike('products.name', `%${q}%`);
    if (category) query.where('categories.slug', category);
    if (status === 'active') query.where('products.is_active', true);
    if (status === 'inactive') query.where('products.is_active', false);
    if (status === 'low') query.where('products.stock_quantity', '<=', 3).where('products.is_active', true);
    return query;
  };

  const [{ count }] = await filtered().count('products.id as count');
  const rows = await filtered()
    .leftJoin('product_images', function join() {
      this.on('product_images.product_id', 'products.id').andOnVal('product_images.is_primary', true);
    })
    .select(
      'products.*',
      'categories.name as category_name',
      'brands.name as brand_name',
      'product_images.file_path as image'
    )
    .orderBy('products.created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    products: rows.map(serializeProduct),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}

async function getProduct(id) {
  const row = await db('products')
    .leftJoin('categories', 'categories.id', 'products.category_id')
    .leftJoin('brands', 'brands.id', 'products.brand_id')
    .leftJoin('product_images', function join() {
      this.on('product_images.product_id', 'products.id').andOnVal('product_images.is_primary', true);
    })
    .select('products.*', 'categories.name as category_name', 'brands.name as brand_name', 'product_images.file_path as image')
    .where('products.id', id)
    .first();
  if (!row) throw new HttpError(404, 'Product not found');
  return serializeProduct(row);
}

async function createProduct(input, actorId) {
  return db.transaction(async (trx) => {
    const slug = await uniqueSlug(trx, 'products', slugify(input.name));
    const [row] = await trx('products')
      .insert({
        name: input.name,
        slug,
        description: input.description,
        price_cents: input.priceCents,
        stock_quantity: input.stockQuantity,
        category_id: input.categoryId,
        brand_id: input.brandId,
        weight_kg: input.weightKg ?? null,
        length_mm: input.lengthMm ?? null,
        width_mm: input.widthMm ?? null,
        height_mm: input.heightMm ?? null,
        range_km: input.rangeKm ?? null,
        battery_kwh: input.batteryKwh ?? null,
        motor_power_kw: input.motorPowerKw ?? null,
        is_active: input.isActive ?? true,
      })
      .returning('*');
    await audit(trx, { actorId, action: 'product.create', entity: 'products', entityId: row.id, meta: { name: row.name } });
    return row.id;
  }).then(getProduct);
}

async function updateProduct(id, input, actorId) {
  await db.transaction(async (trx) => {
    const existing = await trx('products').where({ id }).first();
    if (!existing) throw new HttpError(404, 'Product not found');

    const patch = { updated_at: trx.fn.now() };
    const map = {
      name: 'name', description: 'description', priceCents: 'price_cents',
      stockQuantity: 'stock_quantity', categoryId: 'category_id', brandId: 'brand_id',
      weightKg: 'weight_kg', lengthMm: 'length_mm', widthMm: 'width_mm',
      heightMm: 'height_mm', rangeKm: 'range_km', batteryKwh: 'battery_kwh',
      motorPowerKw: 'motor_power_kw', isActive: 'is_active',
    };
    for (const [from, to] of Object.entries(map)) {
      if (input[from] !== undefined) patch[to] = input[from];
    }
    if (input.name && input.name !== existing.name) {
      patch.slug = await uniqueSlug(trx, 'products', slugify(input.name), id);
    }

    await trx('products').where({ id }).update(patch);
    await audit(trx, {
      actorId, action: 'product.update', entity: 'products', entityId: id,
      // Record what actually changed, not the whole row — an audit trail you
      // can read is worth more than one that is complete but unreadable.
      meta: { changed: Object.keys(patch).filter((k) => k !== 'updated_at') },
    });
  });
  return getProduct(id);
}

// Soft delete by default: a product referenced by past orders must not vanish,
// or order history loses its product link. Hard delete only when nothing
// references it.
async function deleteProduct(id, actorId) {
  return db.transaction(async (trx) => {
    const product = await trx('products').where({ id }).first();
    if (!product) throw new HttpError(404, 'Product not found');

    const [{ count: ordered }] = await trx('order_items').where({ product_id: id }).count('* as count');
    if (Number(ordered) > 0) {
      await trx('products').where({ id }).update({ is_active: false, updated_at: trx.fn.now() });
      await audit(trx, { actorId, action: 'product.deactivate', entity: 'products', entityId: id, meta: { reason: 'referenced by orders', orders: Number(ordered) } });
      return { deleted: false, deactivated: true, reason: `Kept and hidden: ${ordered} order line(s) reference it.` };
    }

    await trx('products').where({ id }).del();
    await audit(trx, { actorId, action: 'product.delete', entity: 'products', entityId: id, meta: { name: product.name } });
    return { deleted: true, deactivated: false };
  });
}

// ---------- Bulk upload ----------

function parseCsv(text) {
  // Small hand-rolled parser: handles quoted fields and embedded commas,
  // which is all a product export needs. A dependency would be overkill.
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const num = (v) => (v === undefined || v === '' ? undefined : Number(v));

// Validates every row first and imports nothing if any row is bad — a
// half-applied catalogue import is worse than a rejected one.
async function bulkUploadProducts({ format, data }, actorId) {
  let records;
  try {
    records = format === 'csv' ? parseCsv(data) : JSON.parse(data);
  } catch (err) {
    throw new HttpError(400, `Could not parse the ${format.toUpperCase()}: ${err.message}`);
  }
  if (!Array.isArray(records)) throw new HttpError(400, 'Expected a list of products');
  if (!records.length) throw new HttpError(400, 'The file contained no rows');
  if (records.length > 500) throw new HttpError(400, 'Please upload at most 500 products at a time');

  const categories = await db('categories').select('id', 'slug', 'name');
  const brands = await db('brands').select('id', 'slug', 'name');
  const bySlug = (list, v) =>
    list.find((x) => x.slug === String(v).toLowerCase() || x.name.toLowerCase() === String(v).toLowerCase());

  const errors = [];
  const prepared = [];

  records.forEach((raw, i) => {
    const line = i + (format === 'csv' ? 2 : 1); // CSV rows are 1-indexed after the header
    const name = (raw.name || '').trim();
    const category = bySlug(categories, raw.category || '');
    const brand = bySlug(brands, raw.brand || '');
    const priceCents =
      raw.priceCents !== undefined ? num(raw.priceCents)
        : raw.price !== undefined ? Math.round(Number(raw.price) * 100)
          : undefined;
    const stock = num(raw.stockQuantity ?? raw.stock);

    if (!name) errors.push({ line, field: 'name', message: 'Name is required' });
    if (!raw.description) errors.push({ line, field: 'description', message: 'Description is required' });
    if (!category) errors.push({ line, field: 'category', message: `Unknown category "${raw.category || ''}"` });
    if (!brand) errors.push({ line, field: 'brand', message: `Unknown brand "${raw.brand || ''}"` });
    if (priceCents === undefined || Number.isNaN(priceCents) || priceCents < 0) {
      errors.push({ line, field: 'price', message: 'Price must be a non-negative number' });
    }
    if (stock === undefined || Number.isNaN(stock) || stock < 0) {
      errors.push({ line, field: 'stock', message: 'Stock must be a non-negative whole number' });
    }

    if (!errors.some((e) => e.line === line)) {
      prepared.push({
        name,
        description: String(raw.description),
        price_cents: Math.round(priceCents),
        stock_quantity: Math.round(stock),
        category_id: category.id,
        brand_id: brand.id,
        weight_kg: num(raw.weightKg) ?? null,
        length_mm: num(raw.lengthMm) ?? null,
        width_mm: num(raw.widthMm) ?? null,
        height_mm: num(raw.heightMm) ?? null,
        range_km: num(raw.rangeKm) ?? null,
        battery_kwh: num(raw.batteryKwh) ?? null,
        motor_power_kw: num(raw.motorPowerKw) ?? null,
        is_active: raw.isActive === undefined ? true : String(raw.isActive).toLowerCase() !== 'false',
      });
    }
  });

  if (errors.length) {
    throw new HttpError(400, `${errors.length} row(s) could not be imported — nothing was changed`, errors.slice(0, 25));
  }

  // One transaction: all rows land, or none do.
  return db.transaction(async (trx) => {
    const created = [];
    const updated = [];
    for (const p of prepared) {
      const slugBase = slugify(p.name);
      const existing = await trx('products').where({ slug: slugBase }).first();
      if (existing) {
        await trx('products').where({ id: existing.id }).update({ ...p, updated_at: trx.fn.now() });
        updated.push(p.name);
      } else {
        const [row] = await trx('products').insert({ ...p, slug: slugBase }).returning('id');
        created.push(p.name);
      }
    }
    await audit(trx, {
      actorId, action: 'product.bulk_upload', entity: 'products', entityId: null,
      meta: { format, created: created.length, updated: updated.length },
    });
    return { created: created.length, updated: updated.length, total: prepared.length };
  });
}

// ---------- Categories ----------

async function listCategories() {
  const rows = await db('categories')
    .leftJoin('products', 'products.category_id', 'categories.id')
    .groupBy('categories.id')
    .select('categories.*')
    .count('products.id as product_count')
    .orderBy([{ column: 'categories.sort_order' }, { column: 'categories.name' }]);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: c.parent_id,
    sortOrder: c.sort_order,
    productCount: Number(c.product_count),
  }));
}

async function createCategory(input, actorId) {
  return db.transaction(async (trx) => {
    const slug = await uniqueSlug(trx, 'categories', slugify(input.name));
    const [row] = await trx('categories')
      .insert({
        name: input.name,
        slug,
        description: input.description || null,
        parent_id: input.parentId ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .returning('*');
    await audit(trx, { actorId, action: 'category.create', entity: 'categories', entityId: row.id, meta: { name: row.name } });
    return row;
  });
}

async function updateCategory(id, input, actorId) {
  return db.transaction(async (trx) => {
    const existing = await trx('categories').where({ id }).first();
    if (!existing) throw new HttpError(404, 'Category not found');
    if (input.parentId === Number(id)) throw new HttpError(400, 'A category cannot be its own parent');

    const patch = { updated_at: trx.fn.now() };
    if (input.name !== undefined) {
      patch.name = input.name;
      if (input.name !== existing.name) patch.slug = await uniqueSlug(trx, 'categories', slugify(input.name), id);
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.parentId !== undefined) patch.parent_id = input.parentId;
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

    const [row] = await trx('categories').where({ id }).update(patch).returning('*');
    await audit(trx, { actorId, action: 'category.update', entity: 'categories', entityId: id, meta: { changed: Object.keys(patch) } });
    return row;
  });
}

async function deleteCategory(id, actorId) {
  return db.transaction(async (trx) => {
    const category = await trx('categories').where({ id }).first();
    if (!category) throw new HttpError(404, 'Category not found');

    const [{ count: products }] = await trx('products').where({ category_id: id }).count('* as count');
    if (Number(products) > 0) {
      throw new HttpError(409, `${products} product(s) are in this category. Move them first.`);
    }
    const [{ count: children }] = await trx('categories').where({ parent_id: id }).count('* as count');
    if (Number(children) > 0) {
      throw new HttpError(409, `${children} sub-categor(y/ies) sit under this one. Remove them first.`);
    }

    await trx('categories').where({ id }).del();
    await audit(trx, { actorId, action: 'category.delete', entity: 'categories', entityId: id, meta: { name: category.name } });
    return { deleted: true };
  });
}

// ---------- Users and roles ----------

async function listUsers({ q, role, page = 1, perPage = 20 } = {}) {
  const base = () => {
    const query = db('users');
    if (q) query.whereILike('email', `%${q}%`).orWhereILike('name', `%${q}%`);
    if (role) query.where({ role });
    return query;
  };
  const [{ count }] = await base().count('* as count');
  const rows = await base()
    .select('id', 'email', 'name', 'role', 'is_active', 'totp_enabled', 'email_verified', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  const ids = rows.map((r) => r.id);
  const orderCounts = ids.length
    ? await db('orders').whereIn('user_id', ids).groupBy('user_id').select('user_id').count('* as n')
    : [];
  const byUser = Object.fromEntries(orderCounts.map((o) => [o.user_id, Number(o.n)]));

  return {
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.is_active,
      twoFactorEnabled: u.totp_enabled,
      emailVerified: u.email_verified,
      orderCount: byUser[u.id] || 0,
      createdAt: u.created_at,
    })),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}

async function updateUser(id, { role, isActive }, actorId) {
  return db.transaction(async (trx) => {
    const user = await trx('users').where({ id }).forUpdate().first();
    if (!user) throw new HttpError(404, 'User not found');

    // Guard rails against locking yourself out, and against removing the last
    // admin — either leaves nobody able to administer the shop.
    if (id === actorId && role && role !== user.role) {
      throw new HttpError(409, 'You cannot change your own role');
    }
    if (id === actorId && isActive === false) {
      throw new HttpError(409, 'You cannot deactivate your own account');
    }
    if (user.role === 'admin' && (role !== undefined && role !== 'admin')) {
      const [{ count }] = await trx('users').where({ role: 'admin', is_active: true }).count('* as count');
      if (Number(count) <= 1) throw new HttpError(409, 'This is the last active admin — promote someone else first');
    }

    const patch = { updated_at: trx.fn.now() };
    if (role !== undefined) patch.role = role;
    if (isActive !== undefined) patch.is_active = isActive;

    const [row] = await trx('users').where({ id }).update(patch).returning('*');
    await audit(trx, {
      actorId, action: 'user.update', entity: 'users', entityId: id,
      meta: { email: user.email, from: { role: user.role, isActive: user.is_active }, to: { role: patch.role, isActive: patch.is_active } },
    });

    // Changing a role or disabling an account must take effect now, not when
    // their access token happens to expire.
    const tokens = require('../auth/token.service');
    await tokens.revokeAllForUser(id);

    return {
      id: row.id, email: row.email, name: row.name, role: row.role,
      isActive: row.is_active, twoFactorEnabled: row.totp_enabled,
    };
  });
}

// ---------- Audit log ----------

async function listAuditLog({ page = 1, perPage = 50 } = {}) {
  const [{ count }] = await db('audit_logs').count('* as count');
  const rows = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.user_id')
    .select('audit_logs.*', 'users.email as actor_email', 'users.name as actor_name')
    .orderBy('audit_logs.created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      actor: r.actor_name ? { name: r.actor_name, email: r.actor_email } : null,
      meta: r.meta,
      at: r.created_at,
    })),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}


// ---------- Delivery options ----------
//
// Checkout cannot happen without at least one active shipping method, so the
// rules here are stricter than for a catalogue entity: a method an order
// already used is deactivated rather than deleted (the order must keep saying
// how it shipped), and the last active one cannot be switched off.

function serializeShippingMethod(row, orderCount = 0) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    price: money(row.price_cents),
    priceCents: row.price_cents,
    etaDays: [row.eta_days_min, row.eta_days_max],
    etaDaysMin: row.eta_days_min,
    etaDaysMax: row.eta_days_max,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    orderCount: Number(orderCount),
  };
}

async function listShippingMethods() {
  const rows = await db('shipping_methods').orderBy([
    { column: 'sort_order' },
    { column: 'id' },
  ]);
  const counts = await db('orders')
    .whereNotNull('shipping_method_id')
    .groupBy('shipping_method_id')
    .select('shipping_method_id')
    .count('* as n');
  const byMethod = Object.fromEntries(counts.map((c) => [c.shipping_method_id, Number(c.n)]));
  return rows.map((r) => serializeShippingMethod(r, byMethod[r.id] || 0));
}

// `code` is the stable machine name. It is derived from the display name and
// made unique, so an operator never has to invent one — and it is not
// editable afterwards, because orders and tests refer to it.
async function uniqueCode(trx, base, ignoreId) {
  let code = base;
  let n = 1;
  for (;;) {
    const q = trx('shipping_methods').where({ code });
    if (ignoreId) q.whereNot('id', ignoreId);
    // eslint-disable-next-line no-await-in-loop
    if (!(await q.first())) return code;
    n += 1;
    code = `${base}_${n}`;
  }
}

async function createShippingMethod(input, actorId) {
  return db.transaction(async (trx) => {
    const base = slugify(input.name).replace(/-/g, '_').slice(0, 40) || 'method';
    const code = await uniqueCode(trx, base);
    const [row] = await trx('shipping_methods')
      .insert({
        code,
        name: input.name,
        description: input.description || null,
        price_cents: input.priceCents,
        eta_days_min: input.etaDaysMin,
        eta_days_max: input.etaDaysMax,
        is_active: input.isActive !== undefined ? input.isActive : true,
        sort_order: input.sortOrder || 0,
      })
      .returning('*');

    await audit(trx, {
      actorId,
      action: 'shipping_method.create',
      entity: 'shipping_methods',
      entityId: row.id,
      meta: { code, name: row.name, priceCents: row.price_cents },
    });
    return serializeShippingMethod(row);
  });
}

async function updateShippingMethod(id, input, actorId) {
  return db.transaction(async (trx) => {
    const existing = await trx('shipping_methods').where({ id }).first();
    if (!existing) throw new HttpError(404, 'Delivery option not found');

    // Turning off the last active option would make checkout impossible for
    // everyone, with no error message that would explain why.
    if (input.isActive === false && existing.is_active) {
      const [{ count }] = await trx('shipping_methods')
        .where({ is_active: true })
        .whereNot('id', id)
        .count('* as count');
      if (Number(count) === 0) {
        throw new HttpError(409, 'This is the only active delivery option — checkout needs at least one.');
      }
    }

    const patch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description || null;
    if (input.priceCents !== undefined) patch.price_cents = input.priceCents;
    if (input.etaDaysMin !== undefined) patch.eta_days_min = input.etaDaysMin;
    if (input.etaDaysMax !== undefined) patch.eta_days_max = input.etaDaysMax;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

    // A partial update can still produce an invalid window once merged with
    // what is already stored, which the request-level schema cannot see.
    const min = patch.eta_days_min ?? existing.eta_days_min;
    const max = patch.eta_days_max ?? existing.eta_days_max;
    if (max < min) {
      throw new HttpError(400, 'The latest delivery day cannot be earlier than the earliest');
    }

    const [row] = await trx('shipping_methods').where({ id }).update(patch).returning('*');
    await audit(trx, {
      actorId,
      action: 'shipping_method.update',
      entity: 'shipping_methods',
      entityId: id,
      meta: { changed: Object.keys(patch) },
    });
    return serializeShippingMethod(row);
  });
}

async function deleteShippingMethod(id, actorId) {
  return db.transaction(async (trx) => {
    const existing = await trx('shipping_methods').where({ id }).first();
    if (!existing) throw new HttpError(404, 'Delivery option not found');

    // Removing the last active option leaves checkout with nothing to offer,
    // whether the row is deleted outright or merely deactivated. The guard
    // therefore runs before deciding which of the two happens — an earlier
    // version checked only on the deactivate path, so deleting an unused last
    // option silently emptied the list.
    if (existing.is_active) {
      const [{ count: others }] = await trx('shipping_methods')
        .where({ is_active: true })
        .whereNot('id', id)
        .count('* as count');
      if (Number(others) === 0) {
        throw new HttpError(409, 'This is the only active delivery option — checkout needs at least one.');
      }
    }

    const [{ count }] = await trx('orders').where({ shipping_method_id: id }).count('* as count');
    const used = Number(count) > 0;

    if (used) {
      // Orders must keep saying how they shipped, so the row survives and is
      // merely withdrawn from checkout.
      await trx('shipping_methods').where({ id }).update({ is_active: false });
      await audit(trx, {
        actorId,
        action: 'shipping_method.deactivate',
        entity: 'shipping_methods',
        entityId: id,
        meta: { reason: 'referenced by orders', orderCount: Number(count) },
      });
      return { deleted: false, deactivated: true, orderCount: Number(count) };
    }

    await trx('shipping_methods').where({ id }).del();
    await audit(trx, {
      actorId,
      action: 'shipping_method.delete',
      entity: 'shipping_methods',
      entityId: id,
      meta: { code: existing.code, name: existing.name },
    });
    return { deleted: true, deactivated: false };
  });
}

module.exports = {
  listShippingMethods,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  stats,
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  bulkUploadProducts, parseCsv,
  listCategories, createCategory, updateCategory, deleteCategory,
  listUsers, updateUser,
  listAuditLog,
};
