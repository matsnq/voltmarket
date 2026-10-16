const { Router } = require('express');
const db = require('../../lib/db');
const service = require('./admin.service');
const reviews = require('../reviews/reviews.service');
const orders = require('../orders/orders.service');
const { money } = require('../../lib/money');
const { decryptField } = require('../../lib/crypto');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const {
  productSchema, productUpdateSchema, productQuerySchema, bulkSchema,
  categorySchema, categoryUpdateSchema,
  userQuerySchema, userUpdateSchema,
  orderQuerySchema, pageSchema,
} = require('./admin.validation');
const { moderateSchema, moderationQuerySchema } = require('../reviews/reviews.validation');

const router = Router();

// Everything below requires an authenticated staff member. `authorize` also
// refuses an admin who has not enrolled 2FA, so that rule is enforced on the
// whole surface rather than remembered per route.
router.use(authenticate);

const staff = authorize('admin', 'support', 'sales');
const adminOnly = authorize('admin');
const sellers = authorize('admin', 'sales');

// ---------- Dashboard ----------
router.get('/stats', staff, async (req, res, next) => {
  try {
    res.json(await service.stats());
  } catch (err) { next(err); }
});

// ---------- Products ----------
router.get('/products', staff, validate(productQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listProducts(req.validated.query));
  } catch (err) { next(err); }
});

router.get('/products/:id', staff, async (req, res, next) => {
  try {
    res.json({ product: await service.getProduct(req.params.id) });
  } catch (err) { next(err); }
});

router.post('/products', sellers, validate(productSchema), async (req, res, next) => {
  try {
    res.status(201).json({ product: await service.createProduct(req.validated.body, req.user.id) });
  } catch (err) { next(err); }
});

router.patch('/products/:id', sellers, validate(productUpdateSchema), async (req, res, next) => {
  try {
    res.json({ product: await service.updateProduct(req.params.id, req.validated.body, req.user.id) });
  } catch (err) { next(err); }
});

router.delete('/products/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await service.deleteProduct(req.params.id, req.user.id));
  } catch (err) { next(err); }
});

// Bulk import. The browser reads the file and posts its text, which keeps the
// endpoint a plain JSON route rather than multipart.
router.post('/products/bulk', sellers, validate(bulkSchema), async (req, res, next) => {
  try {
    res.json(await service.bulkUploadProducts(req.validated.body, req.user.id));
  } catch (err) { next(err); }
});

// A template so an importer knows the exact column names expected.
router.get('/products/bulk/template', staff, async (req, res) => {
  const header = 'name,description,category,brand,price,stock,weightKg,lengthMm,widthMm,heightMm,rangeKm,batteryKwh,motorPowerKw,isActive';
  const example = 'Example EV Charger,"A 22 kW home charger, app controlled",home-chargers,Wallbox,699.00,25,2.0,212,212,113,,,,true';
  res.type('text/csv').attachment('voltmarket-products-template.csv').send(`${header}\n${example}\n`);
});

// ---------- Categories ----------
router.get('/categories', staff, async (req, res, next) => {
  try {
    res.json({ categories: await service.listCategories() });
  } catch (err) { next(err); }
});

router.post('/categories', sellers, validate(categorySchema), async (req, res, next) => {
  try {
    res.status(201).json({ category: await service.createCategory(req.validated.body, req.user.id) });
  } catch (err) { next(err); }
});

router.patch('/categories/:id', sellers, validate(categoryUpdateSchema), async (req, res, next) => {
  try {
    res.json({ category: await service.updateCategory(req.params.id, req.validated.body, req.user.id) });
  } catch (err) { next(err); }
});

router.delete('/categories/:id', adminOnly, async (req, res, next) => {
  try {
    res.json(await service.deleteCategory(req.params.id, req.user.id));
  } catch (err) { next(err); }
});

// ---------- Orders ----------
router.get('/orders', staff, validate(orderQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { status, q, page, perPage } = req.validated.query;
    const base = () => {
      const query = db('orders');
      if (status) query.where({ status });
      if (q) query.whereILike('reference', `%${q}%`);
      return query;
    };
    const [{ count }] = await base().count('* as count');
    const rows = await base()
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage);

    res.json({
      orders: rows.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        // Decrypted for staff, who legitimately need to see who ordered.
        email: o.email_enc ? decryptField(o.email_enc) : null,
        total: money(o.total_cents, o.currency),
        trackingNumber: o.tracking_number,
        placedAt: o.created_at,
      })),
      total: Number(count),
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
    });
  } catch (err) { next(err); }
});

router.get('/orders/:reference', staff, async (req, res, next) => {
  try {
    const order = await orders.getOrderForViewer(req.params.reference, { staff: true });
    res.json({ order });
  } catch (err) { next(err); }
});

// ---------- Reviews moderation ----------
router.get('/reviews', staff, validate(moderationQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await reviews.listForModeration(req.validated.query));
  } catch (err) { next(err); }
});

router.patch('/reviews/:id', staff, validate(moderateSchema), async (req, res, next) => {
  try {
    res.json(await reviews.moderate(req.params.id, req.user.id, req.validated.body));
  } catch (err) { next(err); }
});

router.delete('/reviews/:id', adminOnly, async (req, res, next) => {
  try {
    res.json({ rating: await reviews.remove(req.params.id, req.user.id, { byAdmin: true }) });
  } catch (err) { next(err); }
});

// ---------- Users and roles ----------
router.get('/users', adminOnly, validate(userQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listUsers(req.validated.query));
  } catch (err) { next(err); }
});

router.patch('/users/:id', adminOnly, validate(userUpdateSchema), async (req, res, next) => {
  try {
    res.json({ user: await service.updateUser(req.params.id, req.validated.body, req.user.id) });
  } catch (err) { next(err); }
});

// ---------- Audit log ----------
router.get('/audit-log', adminOnly, validate(pageSchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listAuditLog(req.validated.query));
  } catch (err) { next(err); }
});

module.exports = router;
