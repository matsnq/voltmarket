// Queue worker — the "Order Service (Consume Message)" box in the brief's
// diagram. Runs as its own container from the same image as the API.
//
// Flow: the payment webhook publishes payment.succeeded / payment.failed to
// RabbitMQ; this process consumes, updates the order, adjusts inventory and
// emails the customer. Keeping it out of the webhook means Stripe gets its
// 200 immediately and slow work can be retried independently.
const db = require('./lib/db');
const queue = require('./lib/queue');
const config = require('./config');
const { sendMail, layout } = require('./lib/mailer');
const { formatPrice } = require('./lib/money');
const orders = require('./modules/orders/orders.service');
const payments = require('./modules/payments/payments.service');

const MAX_ATTEMPTS = 3;

async function sendOrderEmail(order, succeeded) {
  const lines = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px 4px 0">${i.quantity} × ${i.name}</td>` +
        `<td style="padding:4px 0;text-align:right">${i.lineTotal.formatted}</td></tr>`
    )
    .join('');

  if (succeeded) {
    await sendMail({
      to: order.email,
      subject: `Order ${order.reference} confirmed ⚡`,
      html: layout(
        `Thank you — your order is confirmed`,
        `<p>Order reference <strong>${order.reference}</strong></p>
         <table style="width:100%;border-collapse:collapse;margin:12px 0">${lines}
           <tr><td style="padding-top:8px">Shipping</td><td style="padding-top:8px;text-align:right">${order.shipping.formatted}</td></tr>
           <tr><td style="font-weight:bold;border-top:1px solid #e5e7eb;padding-top:8px">Total</td>
               <td style="font-weight:bold;border-top:1px solid #e5e7eb;padding-top:8px;text-align:right">${order.total.formatted}</td></tr>
         </table>
         ${order.shippingMethod ? `<p>Delivery: ${order.shippingMethod.name} (${order.shippingMethod.etaDays[0]}–${order.shippingMethod.etaDays[1]} days)</p>` : ''}
         <p><a href="${config.appUrl}/orders/${order.reference}" style="color:#0d4a9c">Track your order →</a></p>`
      ),
    });
  } else {
    await sendMail({
      to: order.email,
      subject: `Payment failed for order ${order.reference}`,
      html: layout(
        'We could not take your payment',
        `<p>Order <strong>${order.reference}</strong> was not completed, so nothing has been charged
          and the items have been returned to stock.</p>
         <p>${order.cancelReason || 'Your bank declined the payment.'}</p>
         <p><a href="${config.appUrl}/cart" style="color:#0d4a9c">Try again →</a></p>`
      ),
    });
  }
}

// Consumers must be idempotent: RabbitMQ redelivers on nack or on a crash
// between the work and the ack, so the same message can legitimately arrive
// twice. The claim is the guard.
async function handlePaymentStatus(message) {
  const fresh = await payments.claimEvent(`queue:${message.eventId}`, 'queue', {
    orderId: message.orderId,
  });
  if (!fresh) {
    console.log(`[worker] duplicate event ${message.eventId}, skipping`);
    return;
  }

  if (message.succeeded) {
    await orders.markPaid(message.orderId, { note: 'Payment confirmed by Stripe' });
  } else {
    // Releases the reserved stock as part of the same transaction.
    await orders.markPaymentFailed(message.orderId, {
      reason: message.failureMessage || 'Payment was declined',
    });
  }

  const order = await orders.getOrderById(message.orderId);
  await sendOrderEmail(order, message.succeeded);
  console.log(
    `[worker] order ${order.reference} -> ${order.status} (event ${message.eventId})`
  );
}

async function start() {
  const channel = await queue.getChannel();
  await channel.prefetch(5);

  await channel.consume(queue.QUEUES.paymentStatus, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      // Unparseable message can never succeed — straight to the dead letter
      // queue rather than looping.
      console.error('[worker] malformed message, dead-lettering');
      return channel.nack(msg, false, false);
    }

    const attempt = (msg.properties.headers['x-attempt'] || 0) + 1;
    try {
      await handlePaymentStatus(payload);
      return channel.ack(msg);
    } catch (err) {
      console.error(`[worker] attempt ${attempt} failed: ${err.message}`);
      if (attempt >= MAX_ATTEMPTS) {
        console.error('[worker] retries exhausted, dead-lettering');
        return channel.nack(msg, false, false); // -> shop.dead-letter
      }
      // Republish with an incremented attempt counter after a short delay.
      setTimeout(() => {
        channel.publish(queue.EXCHANGE, msg.fields.routingKey, msg.content, {
          persistent: true,
          headers: { ...msg.properties.headers, 'x-attempt': attempt },
        });
      }, 1000 * attempt);
      return channel.ack(msg);
    }
  });

  console.log('[worker] consuming', queue.QUEUES.paymentStatus);
}

async function connectWithRetry(attempt = 1) {
  try {
    await start();
  } catch (err) {
    const delay = Math.min(attempt * 1000, 10000);
    console.error(`[worker] connect failed (${err.message}), retry in ${delay}ms`);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
}

connectWithRetry();

async function shutdown() {
  await Promise.allSettled([queue.close(), db.destroy()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
