const { Router } = require('express');
const service = require('./cart.service');
const { validate } = require('../../middleware/validate');
const { optionalAuth } = require('../../middleware/authenticate');
const {
  addItemSchema,
  updateItemSchema,
  itemParamSchema,
} = require('./cart.validation');

const router = Router();

// Every cart route works for guests and logged-in users alike; optionalAuth
// attaches req.user when a token is present without rejecting anonymous calls.
router.use(optionalAuth);

router.get('/', async (req, res, next) => {
  try {
    res.json({ cart: await service.getCart(req, res) });
  } catch (err) {
    next(err);
  }
});

router.post('/items', validate(addItemSchema), async (req, res, next) => {
  try {
    const cart = await service.addItem(req, res, req.validated.body);
    res.status(201).json({ cart });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/items/:itemId',
  validate(itemParamSchema, 'params'),
  validate(updateItemSchema),
  async (req, res, next) => {
    try {
      const cart = await service.updateItem(
        req,
        res,
        req.validated.params.itemId,
        req.validated.body.quantity
      );
      res.json({ cart });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/items/:itemId', validate(itemParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json({ cart: await service.removeItem(req, res, req.validated.params.itemId) });
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    res.json({ cart: await service.clearCart(req, res) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
