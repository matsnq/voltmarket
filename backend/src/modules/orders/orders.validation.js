const { z } = require('zod');

// Syntactic + semantic validation of a shipping address. Whitelisted fields
// only; anything unexpected is rejected rather than quietly stored.
const addressSchema = z
  .object({
    recipient: z
      .string()
      .trim()
      .min(2, 'Recipient name is required')
      .max(120)
      .regex(/^[\p{L}\p{N} .,'-]+$/u, 'Name contains unsupported characters'),
    street: z.string().trim().min(3, 'Street address is required').max(200),
    city: z.string().trim().min(1, 'City is required').max(120),
    postalCode: z
      .string()
      .trim()
      .min(3, 'Postal code is required')
      .max(12)
      .regex(/^[A-Za-z0-9 -]+$/, 'Postal code contains unsupported characters'),
    // Semantic check: must be a country we actually ship to.
    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, 'Use a two-letter country code')
      .refine((c) => SHIPPING_COUNTRIES.includes(c), 'We do not ship to that country yet'),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{5,20}$/, 'Enter a valid phone number')
      .optional()
      .or(z.literal('')),
  })
  .strict();

// Whitelist rather than blocklist: only these destinations are accepted.
const SHIPPING_COUNTRIES = [
  'EE', 'LV', 'LT', 'FI', 'SE', 'DK', 'NO', 'PL', 'DE', 'NL', 'BE', 'FR', 'ES', 'IT', 'AT', 'IE',
];

const checkoutSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
    shippingMethodId: z.coerce.number().int().positive(),
    shippingAddress: addressSchema,
  })
  .strict();

const listOrdersSchema = z
  .object({
    status: z
      .enum([
        'pending_payment', 'paid', 'payment_failed', 'processing',
        'shipped', 'delivered', 'cancelled', 'refunded',
      ])
      .optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: '"from" must not be after "to"',
    path: ['from'],
  });

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

const fulfilmentSchema = z
  .object({
    status: z.enum(['processing', 'shipped', 'delivered']),
    trackingNumber: z
      .string()
      .trim()
      .max(80)
      .regex(/^[A-Za-z0-9 -]+$/, 'Tracking numbers are letters, digits, spaces and dashes')
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const refundSchema = z
  .object({
    amountCents: z.coerce.number().int().positive().max(100000000).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const lookupSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(255).optional() })
  .strict();

module.exports = {
  checkoutSchema,
  refundSchema,
  fulfilmentSchema,
  listOrdersSchema,
  cancelSchema,
  lookupSchema,
  addressSchema,
  SHIPPING_COUNTRIES,
};
