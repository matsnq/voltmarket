const { Router } = require('express');
const service = require('./support.service');
const { contactSchema } = require('./support.validation');
const { validate } = require('../../middleware/validate');
const { optionalAuth } = require('../../middleware/authenticate');
const { rateLimit } = require('../../middleware/rateLimit');

const router = Router();

// Open to guests, so it needs its own tight bucket: 5 messages, refilling at
// one every five minutes. A contact form with only the global limit in front
// of it is a free mail relay.
router.post(
  '/contact',
  rateLimit({ name: 'contact', capacity: 5, refillPerSec: 1 / 300 }),
  optionalAuth,
  validate(contactSchema),
  async (req, res, next) => {
    try {
      const result = await service.submit(req.validated.body, req.user?.id || null);
      res.status(201).json({
        message: 'Thanks — your message is with our support team.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
