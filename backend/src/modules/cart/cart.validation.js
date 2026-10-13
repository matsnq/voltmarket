const { z } = require('zod');
const { MAX_QTY_PER_LINE } = require('./cart.service');

const uuid = z.string().uuid('Invalid identifier');

const addItemSchema = z
  .object({
    productId: uuid,
    quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE).default(1),
  })
  .strict();

const updateItemSchema = z
  .object({ quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE) })
  .strict();

const itemParamSchema = z.object({ itemId: uuid }).strict();

module.exports = { addItemSchema, updateItemSchema, itemParamSchema };
