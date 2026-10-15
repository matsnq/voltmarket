const db = require('../../lib/db');
const { decryptField } = require('../../lib/crypto');
const config = require('../../config');
const queue = require('../../lib/queue');
const { HttpError } = require('../../middleware/errorHandler');

// Stripe is loaded lazily so the whole app still boots (and the catalog,
// cart and auth all work) when no Stripe key is configured.
let stripeClient = null;
function stripe() {
  if (!config.stripe.secretKey) {
    throw new HttpError(503, 'Payments are not configured on this server (STRIPE_SECRET_KEY missing)');
  }
  if (!stripeClient) {
    // eslint-disable-next-line global-require
    stripeClient = require('stripe')(config.stripe.secretKey);
  }
  return stripeClient;
}

function isConfigured() {
  return Boolean(config.stripe.secretKey && config.stripe.webhookSecret);
}

// ---------- Creating the payment ----------
//
// We create a PaymentIntent and hand only its client_secret to the browser.
// Card details go from the browser straight to Stripe's own iframe-hosted
// fields — they never reach this server, which is what keeps the project in
// PCI DSS SAQ-A territory rather than requiring full PCI compliance.
async function createPaymentIntent(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status !== 'pending_payment') {
    throw new HttpError(409, `This order is already ${order.status.replace('_', ' ')}`);
  }

  // Reuse an existing intent if the shopper reloads the payment page.
  const existing = await db('payments')
    .where({ order_id: order.id, status: 'pending' })
    .first();
  if (existing && existing.provider_payment_id) {
    const intent = await stripe().paymentIntents.retrieve(existing.provider_payment_id);
    if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status)) {
      return { clientSecret: intent.client_secret, publicKey: config.stripe.publicKey };
    }
  }

  const intent = await stripe().paymentIntents.create({
    amount: order.total_cents,
    currency: order.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: order.id, order_reference: order.reference },
    receipt_email: order.email_enc ? decryptField(order.email_enc) : undefined,
  });

  await db('payments').insert({
    order_id: order.id,
    provider: 'stripe',
    provider_payment_id: intent.id,
    status: 'pending',
    amount_cents: order.total_cents,
    currency: order.currency,
  });

  return { clientSecret: intent.client_secret, publicKey: config.stripe.publicKey };
}

// ---------- Webhook ----------
//
// Stripe delivers at-least-once and retries anything that does not return 2xx
// quickly. So this handler does the minimum: verify the signature, record the
// payment outcome, publish an event, return 200. All slow work (updating the
// order, adjusting inventory, sending email) happens in the worker.
function verifySignature(rawBody, signature) {
  try {
    return stripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw new HttpError(400, `Webhook signature verification failed: ${err.message}`);
  }
}

// Idempotency guard shared by webhooks and queue consumers. Inserting the key
// IS the lock: a duplicate violates the primary key and tells us to skip.
async function claimEvent(eventKey, source, meta) {
  try {
    await db('processed_events').insert({ event_key: eventKey, source, meta });
    return true;
  } catch (err) {
    if (err.code === '23505') return false; // unique_violation → already handled
    throw err;
  }
}

// Claiming marks an event handled *before* the work runs, which is what stops
// two concurrent deliveries doing it twice. But if the work then fails, the
// claim must go — otherwise the retry sees "already handled", skips, and the
// failure is swallowed forever.
async function releaseEvent(eventKey) {
  await db('processed_events').where({ event_key: eventKey }).del();
}

async function handleStripeEvent(event) {
  const relevant = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'];
  if (!relevant.includes(event.type)) return { ignored: true, type: event.type };

  const fresh = await claimEvent(`stripe:${event.id}`, 'stripe', { type: event.type });
  if (!fresh) return { duplicate: true, type: event.type };

  const intent = event.data.object;
  const orderId = intent.metadata && intent.metadata.order_id;
  if (!orderId) return { ignored: true, reason: 'no order_id in metadata' };

  const succeeded = event.type === 'payment_intent.succeeded';
  const failure = intent.last_payment_error || {};

  await db('payments')
    .where({ provider_payment_id: intent.id })
    .update({
      status: succeeded ? 'succeeded' : event.type.endsWith('canceled') ? 'cancelled' : 'failed',
      failure_code: succeeded ? null : failure.code || null,
      failure_message: succeeded ? null : failure.message || null,
      updated_at: db.fn.now(),
    });

  // Publish to the queue; the Order Service consumes it and updates state.
  await queue.publish(succeeded ? 'payment.succeeded' : 'payment.failed', {
    eventId: event.id,
    orderId,
    paymentIntentId: intent.id,
    succeeded,
    amountCents: intent.amount,
    failureCode: failure.code || null,
    failureMessage: failure.message || null,
    occurredAt: new Date().toISOString(),
  });

  return { published: true, orderId, succeeded };
}

// ---------- Reconciliation ----------
//
// Webhooks are a push mechanism, and pushes can be missed — the tunnel dies,
// the server is restarting, the endpoint is briefly unreachable. Stripe does
// retry, but an order left in pending_payment while the customer has actually
// been charged is the worst failure mode this system has.
//
// So reads of a pending order also *pull*: ask Stripe what really happened and,
// if it disagrees with us, feed the answer through exactly the same queue the
// webhook uses. Same idempotency key, so whichever arrives second is ignored.
async function reconcilePendingPayment(orderId) {
  if (!config.stripe.secretKey) return { reconciled: false, reason: 'stripe not configured' };

  const payment = await db('payments')
    .where({ order_id: orderId, status: 'pending' })
    .whereNotNull('provider_payment_id')
    .first();
  if (!payment) return { reconciled: false, reason: 'no pending payment' };

  let intent;
  try {
    intent = await stripe().paymentIntents.retrieve(payment.provider_payment_id);
  } catch (err) {
    console.error('[reconcile]', err.message);
    return { reconciled: false, reason: 'stripe unreachable' };
  }

  const settled = { succeeded: true, canceled: false };
  if (!(intent.status in settled)) {
    return { reconciled: false, reason: `still ${intent.status}` };
  }
  const succeeded = intent.status === 'succeeded';
  const failure = intent.last_payment_error || {};

  await db('payments')
    .where({ id: payment.id })
    .update({
      status: succeeded ? 'succeeded' : 'cancelled',
      failure_code: succeeded ? null : failure.code || null,
      failure_message: succeeded ? null : failure.message || null,
      updated_at: db.fn.now(),
    });

  // Keyed on the intent, not an event id, so a late webhook for the same
  // payment still collides and is skipped.
  const fresh = await claimEvent(`reconcile:${intent.id}`, 'queue', { orderId });
  if (!fresh) return { reconciled: false, reason: 'already handled' };

  await queue.publish(succeeded ? 'payment.succeeded' : 'payment.failed', {
    eventId: `reconcile_${intent.id}`,
    orderId,
    paymentIntentId: intent.id,
    succeeded,
    amountCents: intent.amount,
    failureCode: failure.code || null,
    failureMessage: failure.message || null,
    occurredAt: new Date().toISOString(),
  });

  console.log(`[reconcile] order ${orderId} -> ${intent.status} from Stripe`);
  return { reconciled: true, status: intent.status };
}

// ---------- Refunds ----------

async function refundOrder(orderId, { amountCents, reason, createdBy }) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new HttpError(404, 'Order not found');

  const payment = await db('payments')
    .where({ order_id: orderId, status: 'succeeded' })
    .first();
  if (!payment) throw new HttpError(409, 'This order has no settled payment to refund');

  const alreadyRefunded = await db('refunds')
    .where({ order_id: orderId })
    .whereNot('status', 'failed')
    .sum('amount_cents as total')
    .first();
  const refundedSoFar = Number(alreadyRefunded.total || 0);
  const amount = amountCents || order.total_cents - refundedSoFar;

  if (amount <= 0 || refundedSoFar + amount > order.total_cents) {
    throw new HttpError(400, 'Refund amount exceeds what remains on this order');
  }

  const stripeRefund = await stripe().refunds.create({
    payment_intent: payment.provider_payment_id,
    amount,
    reason: 'requested_by_customer',
    metadata: { order_id: orderId },
  });

  return db.transaction(async (trx) => {
    const [refund] = await trx('refunds')
      .insert({
        order_id: orderId,
        payment_id: payment.id,
        provider_refund_id: stripeRefund.id,
        amount_cents: amount,
        status: stripeRefund.status || 'pending',
        reason,
        created_by: createdBy || null,
      })
      .returning('*');

    const fullyRefunded = refundedSoFar + amount >= order.total_cents;
    if (fullyRefunded) {
      await trx('orders')
        .where({ id: orderId })
        .update({ status: 'refunded', updated_at: trx.fn.now() });
      await trx('order_events').insert({
        order_id: orderId,
        status: 'refunded',
        note: reason || 'Order refunded',
      });
    } else {
      await trx('order_events').insert({
        order_id: orderId,
        status: order.status,
        note: `Partial refund issued: ${(amount / 100).toFixed(2)} ${order.currency}`,
      });
    }
    return refund;
  });
}

module.exports = {
  isConfigured,
  reconcilePendingPayment,
  createPaymentIntent,
  verifySignature,
  handleStripeEvent,
  claimEvent,
  releaseEvent,
  refundOrder,
};
