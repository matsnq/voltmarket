const db = require('../../lib/db');
const { money } = require('../../lib/money');
const { randomToken } = require('../../lib/crypto');
const { HttpError } = require('../../middleware/errorHandler');

const GUEST_COOKIE = 'cart_token';
const GUEST_TTL_DAYS = 30;
const MAX_QTY_PER_LINE = 20;

// ---------- Cart resolution ----------
//
// Persistence strategy: carts live in Postgres, not in a cookie or in Redis.
// A guest is identified by an opaque cookie token; a logged-in user is
// identified by user_id (one cart each, enforced by a partial unique index).
// Storing lines server-side means a guest's cart survives a browser restart
// and can be merged into their account on login without the client replaying
// anything.

function setGuestCookie(res, token) {
  res.cookie(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax', // lax, not strict: the cart must survive a return from Stripe
    path: '/',
    maxAge: GUEST_TTL_DAYS * 86400000,
  });
}

function clearGuestCookie(res) {
  res.clearCookie(GUEST_COOKIE, { path: '/' });
}

async function findUserCart(userId, trx = db) {
  return trx('carts').where({ user_id: userId }).first();
}

async function findGuestCart(token, trx = db) {
  if (!token) return null;
  return trx('carts').where({ guest_token: token }).first();
}

// Returns the caller's cart, creating one only when `create` is true.
// When a logged-in user arrives carrying a guest cookie, the guest cart is
// merged into their account cart first.
async function resolveCart(req, res, { create = false } = {}) {
  // Memoised per request: addItem resolves the cart and then calls getCart,
  // which would otherwise re-resolve from req.cookies — and a cookie just
  // written to the *response* is not yet readable on the *request*.
  if (req._cart !== undefined && !(create && req._cart === null)) return req._cart;

  const userId = req.user && req.user.id;
  const guestToken = req.cookies[GUEST_COOKIE];

  if (userId) {
    const merged = await mergeGuestIntoUser(guestToken, userId);
    if (merged) clearGuestCookie(res);
    let cart = await findUserCart(userId);
    if (!cart && create) {
      [cart] = await db('carts').insert({ user_id: userId }).returning('*');
    }
    req._cart = cart || null;
    return req._cart;
  }

  let cart = await findGuestCart(guestToken);
  if (!cart && create) {
    const token = randomToken(24);
    [cart] = await db('carts')
      .insert({
        guest_token: token,
        expires_at: new Date(Date.now() + GUEST_TTL_DAYS * 86400000),
      })
      .returning('*');
    setGuestCookie(res, token);
  }
  req._cart = cart || null;
  return req._cart;
}

// Merge rule: quantities for the same product are added together, then capped
// at available stock and the per-line maximum. Runs in one transaction so a
// failure cannot leave items duplicated across two carts.
async function mergeGuestIntoUser(guestToken, userId) {
  if (!guestToken) return false;
  return db.transaction(async (trx) => {
    const guestCart = await findGuestCart(guestToken, trx);
    if (!guestCart) return false;

    const guestItems = await trx('cart_items').where({ cart_id: guestCart.id });
    if (!guestItems.length) {
      await trx('carts').where({ id: guestCart.id }).del();
      return true;
    }

    let userCart = await findUserCart(userId, trx);
    if (!userCart) {
      [userCart] = await trx('carts').insert({ user_id: userId }).returning('*');
    }

    for (const item of guestItems) {
      const product = await trx('products').where({ id: item.product_id }).first();
      if (!product || !product.is_active) continue;

      const existing = await trx('cart_items')
        .where({ cart_id: userCart.id, product_id: item.product_id })
        .first();

      const wanted = (existing ? existing.quantity : 0) + item.quantity;
      const quantity = Math.max(1, Math.min(wanted, product.stock_quantity, MAX_QTY_PER_LINE));

      if (existing) {
        await trx('cart_items')
          .where({ id: existing.id })
          .update({ quantity, updated_at: trx.fn.now() });
      } else {
        await trx('cart_items').insert({
          cart_id: userCart.id,
          product_id: item.product_id,
          quantity,
        });
      }
    }

    await trx('carts').where({ id: guestCart.id }).del(); // cascades its items
    return true;
  });
}

// ---------- Reading ----------

async function cartLines(cartId, trx = db) {
  return trx('cart_items')
    .join('products', 'products.id', 'cart_items.product_id')
    .leftJoin('product_images', function join() {
      this.on('product_images.product_id', 'products.id').andOnVal(
        'product_images.is_primary',
        true
      );
    })
    .where('cart_items.cart_id', cartId)
    .select(
      'cart_items.id',
      'cart_items.quantity',
      'products.id as product_id',
      'products.name',
      'products.slug',
      'products.price_cents',
      'products.currency',
      'products.stock_quantity',
      'products.is_active',
      db.raw('COALESCE(product_images.thumb_path, product_images.file_path) as image'),
      'product_images.alt_text as image_alt'
    )
    .orderBy('cart_items.created_at');
}

// Pure calculation, exported so unit tests can exercise it without a database.
function calculateTotals(lines, shippingCents = 0) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.price_cents * line.quantity,
    0
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  return {
    itemCount,
    subtotal: money(subtotalCents),
    shipping: money(shippingCents),
    total: money(subtotalCents + shippingCents),
  };
}

function serializeLine(line) {
  const available = line.stock_quantity;
  return {
    id: line.id,
    productId: line.product_id,
    name: line.name,
    slug: line.slug,
    image: line.image,
    imageAlt: line.image_alt,
    unitPrice: money(line.price_cents, line.currency),
    quantity: line.quantity,
    lineTotal: money(line.price_cents * line.quantity, line.currency),
    stockQuantity: available,
    // Flagged rather than silently corrected: the shopper should see why the
    // number changed before checkout refuses the order.
    exceedsStock: line.quantity > available,
    unavailable: !line.is_active || available === 0,
  };
}

// Recommendations from the categories already represented in the cart,
// excluding what is already in it.
async function relatedProducts(cartId, limit = 4) {
  const items = await db('cart_items')
    .join('products', 'products.id', 'cart_items.product_id')
    .where('cart_items.cart_id', cartId)
    .select('products.category_id', 'products.id');
  if (!items.length) return [];

  const categoryIds = [...new Set(items.map((i) => i.category_id))];
  const excludeIds = items.map((i) => i.id);

  const rows = await db('products')
    .leftJoin('product_images', function join() {
      this.on('product_images.product_id', 'products.id').andOnVal(
        'product_images.is_primary',
        true
      );
    })
    .whereIn('products.category_id', categoryIds)
    .whereNotIn('products.id', excludeIds)
    .where('products.is_active', true)
    .where('products.stock_quantity', '>', 0)
    .select(
      'products.id',
      'products.name',
      'products.slug',
      'products.price_cents',
      'products.currency',
      'products.rating_avg',
      'product_images.file_path as image',
      'product_images.alt_text as image_alt'
    )
    .orderBy([{ column: 'products.rating_avg', order: 'desc' }])
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    price: money(r.price_cents, r.currency),
    rating: Number(r.rating_avg),
    image: r.image,
    imageAlt: r.image_alt,
  }));
}

async function getCart(req, res) {
  const cart = await resolveCart(req, res);
  if (!cart) {
    return { id: null, items: [], ...calculateTotals([]), related: [] };
  }
  const lines = await cartLines(cart.id);
  const [related] = await Promise.all([relatedProducts(cart.id)]);
  return {
    id: cart.id,
    items: lines.map(serializeLine),
    ...calculateTotals(lines),
    related,
  };
}

// ---------- Mutations ----------

async function addItem(req, res, { productId, quantity }) {
  const product = await db('products').where({ id: productId }).first();
  if (!product || !product.is_active) throw new HttpError(404, 'Product not found');
  if (product.stock_quantity < 1) throw new HttpError(409, 'This product is out of stock');

  const cart = await resolveCart(req, res, { create: true });
  const existing = await db('cart_items')
    .where({ cart_id: cart.id, product_id: productId })
    .first();

  const wanted = (existing ? existing.quantity : 0) + quantity;
  if (wanted > product.stock_quantity) {
    throw new HttpError(
      409,
      `Only ${product.stock_quantity} left in stock${existing ? ` and you already have ${existing.quantity} in your cart` : ''}.`
    );
  }
  if (wanted > MAX_QTY_PER_LINE) {
    throw new HttpError(400, `You can order at most ${MAX_QTY_PER_LINE} of one item.`);
  }

  if (existing) {
    await db('cart_items')
      .where({ id: existing.id })
      .update({ quantity: wanted, updated_at: db.fn.now() });
  } else {
    await db('cart_items').insert({ cart_id: cart.id, product_id: productId, quantity });
  }
  return getCart(req, res);
}

async function updateItem(req, res, itemId, quantity) {
  const cart = await resolveCart(req, res);
  if (!cart) throw new HttpError(404, 'Cart is empty');

  const item = await db('cart_items').where({ id: itemId, cart_id: cart.id }).first();
  if (!item) throw new HttpError(404, 'Item not in your cart');

  const product = await db('products').where({ id: item.product_id }).first();
  if (quantity > product.stock_quantity) {
    throw new HttpError(409, `Only ${product.stock_quantity} left in stock.`);
  }
  await db('cart_items')
    .where({ id: item.id })
    .update({ quantity, updated_at: db.fn.now() });
  return getCart(req, res);
}

async function removeItem(req, res, itemId) {
  const cart = await resolveCart(req, res);
  if (!cart) throw new HttpError(404, 'Cart is empty');
  const deleted = await db('cart_items').where({ id: itemId, cart_id: cart.id }).del();
  if (!deleted) throw new HttpError(404, 'Item not in your cart');
  return getCart(req, res);
}

async function clearCart(req, res) {
  const cart = await resolveCart(req, res);
  if (cart) await db('cart_items').where({ cart_id: cart.id }).del();
  return getCart(req, res);
}

module.exports = {
  GUEST_COOKIE,
  MAX_QTY_PER_LINE,
  resolveCart,
  mergeGuestIntoUser,
  cartLines,
  calculateTotals,
  serializeLine,
  relatedProducts,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  clearGuestCookie,
};
