const { z } = require('zod');

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Invalid value');

// Query params arrive as strings — coerce and bound-check them.
const listProductsSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    category: slug.optional(),
    brand: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+(,[a-z0-9-]+)*$/, 'Invalid brand filter')
      .optional(),
    minPrice: z.coerce.number().min(0).max(10000000).optional(),
    maxPrice: z.coerce.number().min(0).max(10000000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    minRange: z.coerce.number().min(0).max(2000).optional(),
    inStock: z.coerce.boolean().optional(),
    sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'newest']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(60).default(12),
  })
  .strict()
  .refine((v) => !(v.minPrice !== undefined && v.maxPrice !== undefined) || v.minPrice <= v.maxPrice, {
    message: 'minPrice cannot exceed maxPrice',
    path: ['minPrice'],
  });

const suggestSchema = z
  .object({ q: z.string().trim().min(1).max(80) })
  .strict();

const productSlugSchema = z.object({ slug }).strict();

module.exports = { listProductsSchema, suggestSchema, productSlugSchema };
