const { Router } = require('express');
const service = require('./payments.service');
const orders = require('../orders/orders.service');
const { optionalAuth } = require('../../middleware/authenticate');

const router = Router();

// Hands the browser a PaymentIntent client secret. Card details are entered
// into Stripe's own hosted fields and never touch this server.
router.post('/intent/:orderId', optionalAuth, async (req, res, next) => {
  try {
    res.json(await service.createPaymentIntent(req.params.orderId));
  } catch (err) {
    next(err);
  }
});

// Stripe webhook. Mounted with express.raw (see app.js) because signature
// verification needs the exact bytes Stripe signed.
//
// Deliberately minimal: verify, record, publish, 200. Anything slow would
// cause Stripe to time out and redeliver.
router.post('/webhook', async (req, res, next) => {
  try {
    const event = service.verifySignature(req.body, req.headers['stripe-signature']);
    const result = await service.handleStripeEvent(event);
    res.json({ received: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Test-only hook: lets the automated checkout-flow tests drive the queue
// without the Stripe CLI. Refuses to exist outside the test environment.
router.post('/simulate/:orderId', async (req, res, next) => {
  if (process.env.NODE_ENV !== 'test') return res.status(404).json({ error: 'Not found' });
  try {
    const succeeded = req.body.succeeded !== false;
    const order = succeeded
      ? await orders.markPaid(req.params.orderId, { note: 'Simulated payment' })
      : await orders.markPaymentFailed(req.params.orderId, { reason: 'Simulated decline' });
    res.json({ simulated: true, status: order.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
