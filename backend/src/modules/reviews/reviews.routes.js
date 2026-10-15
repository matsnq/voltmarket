const { Router } = require('express');
const db = require('../../lib/db');
const service = require('./reviews.service');
const { validate } = require('../../middleware/validate');
const { authenticate, optionalAuth } = require('../../middleware/authenticate');
const { rateLimit } = require('../../middleware/rateLimit');
const {
  createReviewSchema,
  updateReviewSchema,
  voteSchema,
  listReviewsSchema,
} = require('./reviews.validation');

const router = Router();

// Writing reviews is rate-limited harder than reading them: review spam is
// the obvious abuse vector on an endpoint like this.
const writeLimit = rateLimit({ name: 'reviews-write', capacity: 10, refillPerSec: 0.1 });

async function productIdFromSlug(slug) {
  const row = await db('products').where({ slug }).first();
  return row ? row.id : null;
}

// Public: anyone can read a product's reviews. optionalAuth so a signed-in
// visitor also learns which ones they already voted on.
router.get(
  '/products/:slug/reviews',
  optionalAuth,
  validate(listReviewsSchema, 'query'),
  async (req, res, next) => {
    try {
      const productId = await productIdFromSlug(req.params.slug);
      if (!productId) return res.status(404).json({ error: 'Product not found' });
      res.json(
        await service.listForProduct(productId, {
          viewerId: req.user && req.user.id,
          ...req.validated.query,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/products/:slug/reviews',
  authenticate,
  writeLimit,
  validate(createReviewSchema),
  async (req, res, next) => {
    try {
      const productId = await productIdFromSlug(req.params.slug);
      if (!productId) return res.status(404).json({ error: 'Product not found' });
      res.status(201).json(await service.create(productId, req.user.id, req.validated.body));
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/reviews/:id', authenticate, validate(updateReviewSchema), async (req, res, next) => {
  try {
    res.json(await service.update(req.params.id, req.user.id, req.validated.body));
  } catch (err) {
    next(err);
  }
});

router.delete('/reviews/:id', authenticate, async (req, res, next) => {
  try {
    res.json({ rating: await service.remove(req.params.id, req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews/:id/helpful', authenticate, validate(voteSchema), async (req, res, next) => {
  try {
    res.json(await service.vote(req.params.id, req.user.id, req.validated.body.helpful));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
