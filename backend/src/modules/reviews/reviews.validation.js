const { z } = require('zod');

const createReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1, 'Choose 1 to 5 stars').max(5),
    title: z.string().trim().min(3).max(150).optional().or(z.literal('')),
    body: z
      .string()
      .trim()
      .min(10, 'Please write at least 10 characters')
      .max(4000, 'Reviews are limited to 4000 characters'),
  })
  .strict();

const updateReviewSchema = createReviewSchema.partial().strict();

const voteSchema = z.object({ helpful: z.boolean().default(true) }).strict();

const listReviewsSchema = z
  .object({
    sort: z.enum(['helpful', 'recent', 'highest', 'lowest']).default('helpful'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

const moderateSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'pending']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const moderationQuerySchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'pending']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

module.exports = {
  createReviewSchema,
  updateReviewSchema,
  voteSchema,
  listReviewsSchema,
  moderateSchema,
  moderationQuerySchema,
};
