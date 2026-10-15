const { Router } = require('express');
const service = require('./addresses.service');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { addressSchema } = require('../orders/orders.validation');
const { z } = require('zod');

const router = Router();
router.use(authenticate); // saved addresses belong to an account

const bodySchema = addressSchema
  .extend({ label: z.string().trim().max(60).optional(), isDefault: z.boolean().optional() })
  .strict();

router.get('/', async (req, res, next) => {
  try {
    res.json({ addresses: await service.list(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(bodySchema), async (req, res, next) => {
  try {
    const { isDefault, ...address } = req.validated.body;
    res.status(201).json({ address: await service.create(req.user.id, address, { isDefault }) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(bodySchema), async (req, res, next) => {
  try {
    const { isDefault, ...address } = req.validated.body;
    res.json({ address: await service.update(req.user.id, req.params.id, address, { isDefault }) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await service.remove(req.user.id, req.params.id);
    res.json({ message: 'Address removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
