const crypto = require('crypto');
const db = require('../../lib/db');
const { money } = require('../../lib/money');
const { encryptField, decryptField, blindIndex } = require('../../lib/crypto');
const { HttpError } = require('../../middleware/errorHandler');
const cartService = require('../cart/cart.service');
const addressesService = require('../users/addresses.service');

// Statuses a customer may still cancel from. Once the warehouse has started
// processing, cancellation becomes a refund instead.
const CANCELLABLE = ['pending_payment', 'payment_failed', 'paid'];

// A placed order holds its stock this long. Long enough to finish paying —
// including retrying a declined card — short enough that abandoned baskets
// do not quietly consume the catalogue.
const RESERVATION_MINUTES = 60;

function generateReference() {
  // Crockford-ish alphabet: no I/O/0/1, so references survive being read
  // aloud over the phone.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `VM-${out}`;
}

async function recordEvent(trx, orderId, status, note) {
  await trx('order_events').insert({ order_id: orderId, status, note });
}

// ---------- Checkout ----------
//
// The entire order is created in ONE transaction:
//   1. lock the product rows (SELECT ... FOR UPDATE, ordered by id)
//   2. re-read true stock and validate
//   3. insert order + snapshotted items
//   4. decrement stock (reservation)
//   5. empty the cart
//
// Step 1 is what prevents overselling. Postgres defaults to READ COMMITTED,
// where two concurrent checkouts can both read "1 in stock" and both proceed.
// The row lock serialises them: the second transaction blocks until the first
// commits, then sees the decremented value and fails validation.
//
// Ordering the locks by product id prevents deadlocks between two orders that
// contain the same products in different sequences.
//
// Stock is reserved at placement rather than at payment success, so a shopper
// who has reached the payment step cannot lose their item to someone faster.
// Failed or cancelled payments release the reservation.
async function createOrder(req, res, payload) {
  const userId = req.user ? req.user.id : null;
  const cart = await cartService.resolveCart(req, res);
  if (!cart) throw new HttpError(400, 'Your cart is empty');

  const lines = await cartService.cartLines(cart.id);
  if (!lines.length) throw new HttpError(400, 'Your cart is empty');

  const shippingMethod = await db('shipping_methods')
    .where({ id: payload.shippingMethodId, is_active: true })
    .first();
  if (!shippingMethod) throw new HttpError(400, 'Choose a valid shipping method');

  const order = await db.transaction(async (trx) => {
    const productIds = lines.map((l) => l.product_id);

    const locked = await trx('products')
      .whereIn('id', productIds)
      .orderBy('id')
      .forUpdate();
    const byId = new Map(locked.map((p) => [p.id, p]));

    // Validate against the freshly locked rows, not the values read earlier.
    for (const line of lines) {
      const product = byId.get(line.product_id);
      if (!product || !product.is_active) {
        throw new HttpError(409, `"${line.name}" is no longer available.`);
      }
      if (product.stock_quantity < line.quantity) {
        throw new HttpError(
          409,
          `Only ${product.stock_quantity} × "${product.name}" left in stock. Please update your cart.`
        );
      }
    }

    const subtotalCents = lines.reduce(
      (sum, l) => sum + byId.get(l.product_id).price_cents * l.quantity,
      0
    );
    const shippingCents = shippingMethod.price_cents;

    const [created] = await trx('orders')
      .insert({
        reference: generateReference(),
        user_id: userId,
        email_enc: encryptField(payload.email),
        email_hash: blindIndex(payload.email),
        status: 'pending_payment',
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents: subtotalCents + shippingCents,
        shipping_method_id: shippingMethod.id,
        // The address is encrypted and snapshotted: later edits to a saved
        // address must not rewrite where a past order went.
        shipping_address_enc: encryptField(JSON.stringify(payload.shippingAddress)),
        reservation_expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60000),
      })
      .returning('*');

    for (const line of lines) {
      const product = byId.get(line.product_id);
      await trx('order_items').insert({
        order_id: created.id,
        product_id: product.id,
        name_snapshot: product.name,
        slug_snapshot: product.slug,
        image_snapshot: line.image,
        price_cents_snapshot: product.price_cents,
        quantity: line.quantity,
        line_total_cents: product.price_cents * line.quantity,
      });

      // Guarded decrement: the WHERE clause is a second line of defence, so
      // even a logic error cannot drive stock negative.
      const updated = await trx('products')
        .where({ id: product.id })
        .where('stock_quantity', '>=', line.quantity)
        .decrement('stock_quantity', line.quantity);
      if (!updated) {
        throw new HttpError(409, `"${product.name}" sold out while you were checking out.`);
      }
    }

    await recordEvent(trx, created.id, 'pending_payment', 'Order placed, awaiting payment');
    await trx('cart_items').where({ cart_id: cart.id }).del();

    return created;
  });

  // Remember where a signed-in shopper sent this order, so the next checkout
  // can prefill it. Best-effort: never fail a placed order over a convenience.
  if (userId) {
    try {
      await addressesService.rememberFromCheckout(userId, payload.shippingAddress);
    } catch (err) {
      console.error('[address] could not save for reuse:', err.message);
    }
  }

  return getOrderById(order.id);
}

// ---------- Stock release ----------

// Returns reserved stock when an order never completes. Idempotent via the
// order's own status transition, which the callers check first.
async function releaseStock(trx, orderId) {
  const items = await trx('order_items').where({ order_id: orderId });
  for (const item of items) {
    if (!item.product_id) continue;
    await trx('products')
      .where({ id: item.product_id })
      .increment('stock_quantity', item.quantity);
  }
}

// ---------- Status transitions (called by the queue worker) ----------

// Statuses a successful payment may arrive into. `payment_failed` is here
// because Stripe keeps a PaymentIntent usable after a decline: the shopper can
// try a second card on the same order, and that success must be honoured.
const PAYABLE = ['pending_payment', 'payment_failed'];

async function markPaid(orderId, { note } = {}) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new HttpError(404, 'Order not found');

    if (order.status === 'paid') return { order, outcome: 'already_paid' };

    // Money arrived for an order whose stock we no longer hold. We cannot
    // fulfil it, so the caller must refund rather than silently keep the cash.
    if (!PAYABLE.includes(order.status)) {
      await recordEvent(
        trx,
        orderId,
        order.status,
        `Payment succeeded after the order was ${order.status.replace('_', ' ')} — refund required`
      );
      return { order, outcome: 'unfulfillable' };
    }

    const [updated] = await trx('orders')
      .where({ id: orderId })
      .update({
        status: 'paid',
        paid_at: trx.fn.now(),
        reservation_expires_at: null, // paid stock is no longer a reservation
        updated_at: trx.fn.now(),
      })
      .returning('*');
    await recordEvent(
      trx,
      orderId,
      'paid',
      note || (order.status === 'payment_failed' ? 'Payment received on retry' : 'Payment received')
    );
    return { order: updated, outcome: 'paid' };
  });
}

async function markPaymentFailed(orderId, { reason } = {}) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new HttpError(404, 'Order not found');
    if (!PAYABLE.includes(order.status)) return { order, outcome: 'ignored' };

    // The stock stays reserved. Stripe allows another card against the same
    // PaymentIntent, and releasing here would let someone else buy the item
    // out from under a shopper who is still at the payment step. The
    // reservation expiry (swept by the worker) is what eventually frees it.
    const [updated] = await trx('orders')
      .where({ id: orderId })
      .update({
        status: 'payment_failed',
        reservation_expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60000),
        updated_at: trx.fn.now(),
      })
      .returning('*');
    await recordEvent(
      trx,
      orderId,
      'payment_failed',
      `${reason || 'Payment failed'} — items stay reserved for ${RESERVATION_MINUTES} minutes so you can try another card`
    );
    return { order: updated, outcome: 'failed' };
  });
}

// --- BUG 4: release stock held by orders nobody came back to pay for ---
async function expireStaleReservations() {
  const stale = await db('orders')
    .whereIn('status', ['pending_payment', 'payment_failed'])
    .whereNotNull('reservation_expires_at')
    .where('reservation_expires_at', '<', new Date())
    .select('id', 'reference');

  const expired = [];
  for (const row of stale) {
    try {
      await db.transaction(async (trx) => {
        // Re-read under a lock: a payment may have landed since the sweep began.
        const order = await trx('orders').where({ id: row.id }).forUpdate().first();
        if (!['pending_payment', 'payment_failed'].includes(order.status)) return;
        if (!order.reservation_expires_at || new Date(order.reservation_expires_at) >= new Date()) return;

        await releaseStock(trx, order.id);
        await trx('orders').where({ id: order.id }).update({
          status: 'cancelled',
          cancelled_at: trx.fn.now(),
          cancel_reason: 'Payment not completed in time',
          reservation_expires_at: null,
          updated_at: trx.fn.now(),
        });
        await recordEvent(trx, order.id, 'cancelled', 'Reservation expired — items returned to stock');
        expired.push(order.reference);
      });
    } catch (err) {
      console.error(`[expiry] ${row.reference}: ${err.message}`);
    }
  }
  return expired;
}

async function cancelOrder(orderId, { userId, reason, byAdmin = false }) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new HttpError(404, 'Order not found');
    if (!byAdmin && userId && order.user_id !== userId) {
      throw new HttpError(403, 'This is not your order');
    }
    if (!CANCELLABLE.includes(order.status)) {
      throw new HttpError(
        409,
        `An order that is already ${order.status.replace('_', ' ')} cannot be cancelled. Request a refund instead.`
      );
    }
    const wasPaid = order.status === 'paid';

    await releaseStock(trx, orderId);
    const [updated] = await trx('orders')
      .where({ id: orderId })
      .update({
        status: 'cancelled',
        cancelled_at: trx.fn.now(),
        cancel_reason: reason || null,
        reservation_expires_at: null,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    await recordEvent(trx, orderId, 'cancelled', reason || 'Cancelled by customer');

    // Cancelling an order that was already paid for has to return the money,
    // not just the stock. Flagged here and performed by the caller, because
    // the refund is a network call and must not run inside this transaction.
    return { order: updated, refundRequired: wasPaid };
  });
}

// ---------- Fulfilment ----------
//
// Moving an order through the warehouse. Transitions are whitelisted rather
// than freeform: an order may only advance along a defined path, so a typo
// or a replayed request cannot send a delivered order back to processing.
const FULFILMENT_FLOW = {
  paid: ['processing', 'cancelled'],
  processing: ['shipped'],
  shipped: ['delivered'],
};

async function updateFulfilment(orderId, { status, trackingNumber, note, actorId }) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw new HttpError(404, 'Order not found');

    const allowed = FULFILMENT_FLOW[order.status] || [];
    if (!allowed.includes(status)) {
      throw new HttpError(
        409,
        `An order that is ${order.status.replace('_', ' ')} cannot become ${status.replace('_', ' ')}.` +
          (allowed.length ? ` Allowed next: ${allowed.join(', ')}.` : '')
      );
    }

    const patch = { status, updated_at: trx.fn.now() };
    if (status === 'shipped') patch.shipped_at = trx.fn.now();
    if (trackingNumber !== undefined) patch.tracking_number = trackingNumber || null;

    const [updated] = await trx('orders').where({ id: orderId }).update(patch).returning('*');
    await recordEvent(
      trx,
      orderId,
      status,
      note || (trackingNumber ? `Tracking: ${trackingNumber}` : null)
    );

    // Staff actions on someone else's order are auditable.
    await trx('audit_logs').insert({
      user_id: actorId || null,
      action: `order.${status}`,
      entity: 'orders',
      entity_id: orderId,
      meta: JSON.stringify({ from: order.status, to: status, trackingNumber: trackingNumber || null }),
    });

    return updated;
  });
}

// ---------- Reading ----------

function serializeOrder(order, items = [], events = [], shippingMethod = null) {
  let address = null;
  try {
    address = order.shipping_address_enc
      ? JSON.parse(decryptField(order.shipping_address_enc))
      : null;
  } catch {
    address = null;
  }
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    email: order.email_enc ? decryptField(order.email_enc) : null,
    placedAt: order.created_at,
    paidAt: order.paid_at,
    shippedAt: order.shipped_at,
    cancelledAt: order.cancelled_at,
    cancelReason: order.cancel_reason,
    trackingNumber: order.tracking_number,
    subtotal: money(order.subtotal_cents, order.currency),
    shipping: money(order.shipping_cents, order.currency),
    total: money(order.total_cents, order.currency),
    shippingAddress: address,
    shippingMethod: shippingMethod
      ? {
          code: shippingMethod.code,
          name: shippingMethod.name,
          etaDays: [shippingMethod.eta_days_min, shippingMethod.eta_days_max],
        }
      : null,
    canCancel: CANCELLABLE.includes(order.status),
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name_snapshot,
      slug: i.slug_snapshot,
      image: i.image_snapshot,
      unitPrice: money(i.price_cents_snapshot, order.currency),
      quantity: i.quantity,
      lineTotal: money(i.line_total_cents, order.currency),
    })),
    timeline: events.map((e) => ({ status: e.status, note: e.note, at: e.created_at })),
  };
}

async function getOrderById(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new HttpError(404, 'Order not found');
  const [items, events, shippingMethod] = await Promise.all([
    db('order_items').where({ order_id: order.id }),
    db('order_events').where({ order_id: order.id }).orderBy('created_at'),
    order.shipping_method_id
      ? db('shipping_methods').where({ id: order.shipping_method_id }).first()
      : null,
  ]);
  return serializeOrder(order, items, events, shippingMethod);
}

// Guests have no account, so they retrieve an order with reference + email —
// two pieces of information only the buyer should hold.
async function getOrderForViewer(identifier, { userId, email, staff = false }) {
  const query = db('orders').where(function where() {
    this.where('reference', identifier);
    // Only treat it as an id when it actually looks like one.
    if (/^[0-9a-f-]{36}$/i.test(identifier)) this.orWhere('id', identifier);
  });
  const order = await query.first();
  if (!order) throw new HttpError(404, 'Order not found');

  if (staff) return getOrderById(order.id); // authorize() already checked the role

  if (order.user_id) {
    if (order.user_id !== userId) throw new HttpError(403, 'This is not your order');
  } else if (!email || blindIndex(email) !== order.email_hash) {
    // Compared via the blind index: the plaintext address is never read back
    // just to authorise a lookup.
    throw new HttpError(403, 'Provide the email address used for this order');
  }
  return getOrderById(order.id);
}

async function listOrders(userId, filters = {}) {
  const query = db('orders').where({ user_id: userId });
  if (filters.status) query.where('status', filters.status);
  if (filters.from) query.where('created_at', '>=', filters.from);
  if (filters.to) query.where('created_at', '<=', `${filters.to} 23:59:59`);

  const page = filters.page || 1;
  const perPage = filters.perPage || 10;

  const [{ count }] = await query.clone().clearOrder().count('* as count');
  const rows = await query
    .orderBy('created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  const ids = rows.map((r) => r.id);
  const items = ids.length ? await db('order_items').whereIn('order_id', ids) : [];
  const byOrder = new Map();
  for (const item of items) {
    const list = byOrder.get(item.order_id) || [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }

  return {
    orders: rows.map((o) => serializeOrder(o, byOrder.get(o.id) || [])),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}

async function listShippingMethods() {
  const rows = await db('shipping_methods').where({ is_active: true }).orderBy('sort_order');
  return rows.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    price: money(m.price_cents),
    etaDays: [m.eta_days_min, m.eta_days_max],
  }));
}

module.exports = {
  createOrder,
  expireStaleReservations,
  RESERVATION_MINUTES,
  PAYABLE,
  updateFulfilment,
  FULFILMENT_FLOW,
  markPaid,
  markPaymentFailed,
  cancelOrder,
  releaseStock,
  getOrderById,
  getOrderForViewer,
  listOrders,
  listShippingMethods,
  serializeOrder,
  generateReference,
  CANCELLABLE,
};
