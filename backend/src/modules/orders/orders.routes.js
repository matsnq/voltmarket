const { Router } = require('express');
const service = require('./orders.service');
const paymentsService = require('../payments/payments.service');
const { validate } = require('../../middleware/validate');
const { authenticate, optionalAuth } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const {
  checkoutSchema,
  fulfilmentSchema,
  listOrdersSchema,
  cancelSchema,
  lookupSchema,
} = require('./orders.validation');

const router = Router();

// Staff may read and act on any order. The role is re-read from the database
// rather than trusted from the token, so a revoked role takes effect at once
// — the same reason `authorize` does it. Only costs a query when the token
// actually claims a staff role.
const STAFF_ROLES = ['admin', 'sales', 'support'];
async function isStaff(user) {
  if (!user || !STAFF_ROLES.includes(user.role)) return false;
  const db = require('../../lib/db');
  const row = await db('users').where({ id: user.id }).first();
  return Boolean(row && row.is_active && STAFF_ROLES.includes(row.role));
}

// Shipping options for the checkout page (public).
router.get('/shipping-methods', async (req, res, next) => {
  try {
    res.json({ shippingMethods: await service.listShippingMethods() });
  } catch (err) {
    next(err);
  }
});

// Checkout. Works for guests and logged-in users alike.
router.post('/checkout', optionalAuth, validate(checkoutSchema), async (req, res, next) => {
  try {
    const order = await service.createOrder(req, res, req.validated.body);
    res.status(201).json({ order, paymentsConfigured: paymentsService.isConfigured() });
  } catch (err) {
    next(err);
  }
});

// A customer's own order history, filterable by status and date.
router.get('/orders', authenticate, validate(listOrdersSchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listOrders(req.user.id, req.validated.query));
  } catch (err) {
    next(err);
  }
});

// Order detail. Logged-in users are matched by account; guests must supply
// the email the order was placed with.
router.get('/orders/:identifier', optionalAuth, validate(lookupSchema, 'query'), async (req, res, next) => {
  try {
    let order = await service.getOrderForViewer(req.params.identifier, {
      userId: req.user && req.user.id,
      email: req.validated.query.email,
      staff: await isStaff(req.user),
    });

    // Self-healing: if the order still looks unpaid, ask Stripe directly
    // rather than trusting that the webhook arrived. Covers a missed or
    // delayed delivery, and costs one API call only while an order is
    // genuinely pending.
    if (order.status === 'pending_payment') {
      const result = await paymentsService.reconcilePendingPayment(order.id);
      if (result.reconciled) {
        await new Promise((resolve) => setTimeout(resolve, 400)); // let the worker consume
        order = await service.getOrderById(order.id);
      }
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:identifier/cancel', authenticate, validate(cancelSchema), async (req, res, next) => {
  try {
    const staff = await isStaff(req.user);
    const existing = await service.getOrderForViewer(req.params.identifier, {
      userId: req.user.id,
      staff,
    });
    await service.cancelOrder(existing.id, {
      userId: req.user.id,
      reason: req.validated.body.reason,
      byAdmin: staff,
    });
    res.json({ order: await service.getOrderById(existing.id) });
  } catch (err) {
    next(err);
  }
});

// Staff move an order through the warehouse and attach a tracking number.
// Restricted to admin/sales — and because `authorize` also enforces it, an
// admin without 2FA enrolled is refused.
router.patch(
  '/orders/:identifier/fulfilment',
  authenticate,
  authorize('admin', 'sales'),
  validate(fulfilmentSchema),
  async (req, res, next) => {
    try {
      const existing = await service.getOrderForViewer(req.params.identifier, {
        userId: req.user.id,
        staff: true, // authorize() above already confirmed the role
      });
      await service.updateFulfilment(existing.id, {
        ...req.validated.body,
        actorId: req.user.id,
      });
      res.json({ order: await service.getOrderById(existing.id) });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
