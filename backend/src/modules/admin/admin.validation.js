const { z } = require('zod');

const name = z.string().trim().min(2).max(200);
const money = z.coerce.number().int().min(0).max(100000000); // cents
const qty = z.coerce.number().int().min(0).max(1000000);
const optionalNum = (max) => z.coerce.number().min(0).max(max).optional().nullable();

const productSchema = z
  .object({
    name,
    description: z.string().trim().min(10).max(5000),
    priceCents: money,
    stockQuantity: qty,
    categoryId: z.coerce.number().int().positive(),
    brandId: z.coerce.number().int().positive(),
    weightKg: optionalNum(100000),
    lengthMm: optionalNum(100000),
    widthMm: optionalNum(100000),
    heightMm: optionalNum(100000),
    rangeKm: optionalNum(2000),
    batteryKwh: optionalNum(1000),
    motorPowerKw: optionalNum(5000),
    isActive: z.boolean().optional(),
  })
  .strict();

const productUpdateSchema = productSchema.partial().strict();

const productQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    category: z.string().trim().max(140).optional(),
    status: z.enum(['active', 'inactive', 'low']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const bulkSchema = z
  .object({
    format: z.enum(['csv', 'json']),
    // 2 MB of text is roughly 500 products with long descriptions.
    data: z.string().min(1).max(2_000_000),
  })
  .strict();

const categorySchema = z
  .object({
    name,
    description: z.string().trim().max(1000).optional().nullable(),
    parentId: z.coerce.number().int().positive().optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .strict();

const categoryUpdateSchema = categorySchema.partial().strict();

const shippingMethodSchema = z
  .object({
    name,
    description: z.string().trim().max(1000).optional().nullable(),
    // Prices are integer cents everywhere, and free delivery is legitimate.
    priceCents: z.coerce.number().int().min(0).max(10000000),
    etaDaysMin: z.coerce.number().int().min(0).max(365),
    etaDaysMax: z.coerce.number().int().min(0).max(365),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .strict()
  // Semantic rule: a window that ends before it starts is well-formed but
  // meaningless, and the storefront renders it as "5-3 business days".
  .refine((m) => m.etaDaysMax >= m.etaDaysMin, {
    message: 'The latest delivery day cannot be earlier than the earliest',
    path: ['etaDaysMax'],
  });

const shippingMethodUpdateSchema = shippingMethodSchema
  .innerType()
  .partial()
  .strict()
  .refine((m) => m.etaDaysMin === undefined || m.etaDaysMax === undefined || m.etaDaysMax >= m.etaDaysMin, {
    message: 'The latest delivery day cannot be earlier than the earliest',
    path: ['etaDaysMax'],
  });

const userQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: z.enum(['customer', 'support', 'sales', 'admin']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const userUpdateSchema = z
  .object({
    role: z.enum(['customer', 'support', 'sales', 'admin']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: 'Nothing to change',
  });

const orderQuerySchema = z
  .object({
    status: z
      .enum(['pending_payment', 'paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
      .optional(),
    q: z.string().trim().max(60).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

module.exports = {
  productSchema, productUpdateSchema, productQuerySchema, bulkSchema,
  categorySchema, categoryUpdateSchema,
  shippingMethodSchema, shippingMethodUpdateSchema,
  userQuerySchema, userUpdateSchema,
  orderQuerySchema, pageSchema,
};
