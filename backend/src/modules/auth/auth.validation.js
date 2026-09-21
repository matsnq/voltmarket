const { z } = require('zod');

// Whitelisting: `.strict()` rejects unexpected fields outright.
// Syntactic checks (formats) + semantic checks (lengths, character classes).

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address')
  .max(255);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt limit
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120)
  .regex(/^[\p{L}\p{N} .,'-]+$/u, 'Name contains unsupported characters');

const otp = z
  .string()
  .trim()
  .regex(/^([0-9]{6}|[a-f0-9]{10})$/i, 'Enter the 6-digit code or a recovery code');

const registerSchema = z
  .object({
    email,
    password,
    name,
    captchaToken: z.string().min(1, 'CAPTCHA is required'),
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required').max(72),
    otp: otp.optional(),
  })
  .strict();

const forgotPasswordSchema = z.object({ email }).strict();

const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{96}$/i, 'Invalid reset token'),
    password,
  })
  .strict();

const enable2faSchema = z
  .object({ otp: z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code') })
  .strict();

const disable2faSchema = z
  .object({
    otp,
    password: z.string().min(1).max(72).optional(),
  })
  .strict();

const updateProfileSchema = z
  .object({
    name: name.optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{5,20}$/, 'Please enter a valid phone number')
      .nullable()
      .optional(),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  enable2faSchema,
  disable2faSchema,
  updateProfileSchema,
};
