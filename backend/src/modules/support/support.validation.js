const { z } = require('zod');

const TOPICS = ['order', 'product', 'returns', 'technical', 'other'];

const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Tell us your name')
      .max(120)
      .regex(/^[\p{L}\p{N} .,'-]+$/u, 'Name contains unsupported characters'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
    topic: z.enum(TOPICS, { errorMap: () => ({ message: 'Choose what your message is about' }) }),
    subject: z.string().trim().min(3, 'Add a short subject').max(150),
    message: z.string().trim().min(20, 'Please give us at least a sentence or two').max(5000),
    // Optional, but if present it must look like one of our references.
    orderReference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^VM-[A-Z0-9]{6}$/, 'Order references look like VM-AB12CD')
      .optional()
      .or(z.literal('')),
  })
  .strict();

const listSchema = z
  .object({
    status: z.enum(['new', 'in_progress', 'closed']).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const updateSchema = z
  .object({ status: z.enum(['new', 'in_progress', 'closed']) })
  .strict();

module.exports = { contactSchema, listSchema, updateSchema, TOPICS };
