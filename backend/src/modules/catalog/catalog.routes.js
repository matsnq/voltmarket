const { Router } = require('express');
const service = require('./catalog.service');
const { validate } = require('../../middleware/validate');
const {
  listProductsSchema,
  suggestSchema,
  productSlugSchema,
} = require('./catalog.validation');

const router = Router();

router.get('/categories', async (req, res, next) => {
  try {
    res.json({ categories: await service.categoryTree() });
  } catch (err) {
    next(err);
  }
});

router.get('/brands', async (req, res, next) => {
  try {
    res.json({ brands: await service.listBrands() });
  } catch (err) {
    next(err);
  }
});

router.get('/products', validate(listProductsSchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listProducts(req.validated.query));
  } catch (err) {
    next(err);
  }
});

router.get('/products/suggest', validate(suggestSchema, 'query'), async (req, res, next) => {
  try {
    res.json({ suggestions: await service.suggest(req.validated.query.q) });
  } catch (err) {
    next(err);
  }
});

router.get('/products/:slug', validate(productSlugSchema, 'params'), async (req, res, next) => {
  try {
    res.json({ product: await service.getProduct(req.validated.params.slug) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
