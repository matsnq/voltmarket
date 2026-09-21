const { Router } = require('express');
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, optionalAuth } = require('../../middleware/authenticate');
const { rateLimit } = require('../../middleware/rateLimit');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  enable2faSchema,
  disable2faSchema,
  updateProfileSchema,
} = require('./auth.validation');

const router = Router();

// Public runtime configuration for the SPA (never secrets — site keys only).
router.get('/config', (req, res) => {
  const config = require('../../config');
  res.json({
    recaptchaSiteKey: config.recaptchaSiteKey,
    googleEnabled: Boolean(config.google.clientId && config.google.clientSecret),
  });
});

// Auth endpoints get a much stricter token bucket than the global one —
// brute-force and credential-stuffing protection.
const strictLimit = rateLimit({ name: 'auth-strict', capacity: 10, refillPerSec: 0.2 });

router.post('/register', strictLimit, validate(registerSchema), controller.register);
router.post('/login', strictLimit, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', optionalAuth, controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);

router.post('/password/forgot', strictLimit, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/password/reset', strictLimit, validate(resetPasswordSchema), controller.resetPassword);

router.post('/2fa/setup', authenticate, controller.setup2fa);
router.post('/2fa/enable', authenticate, validate(enable2faSchema), controller.enable2fa);
router.post('/2fa/disable', authenticate, validate(disable2faSchema), controller.disable2fa);

router.get('/google', controller.googleStart);
router.get('/google/callback', controller.googleCallback);

router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, validate(updateProfileSchema), controller.updateMe);

module.exports = router;
