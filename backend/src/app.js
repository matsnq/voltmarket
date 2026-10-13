const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { rateLimit } = require('./middleware/rateLimit');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const orderRoutes = require('./modules/orders/orders.routes');
const paymentRoutes = require('./modules/payments/payments.routes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind nginx
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());

  // Stripe webhook (Project 2) must receive the raw body for signature checks,
  // so it is excluded from JSON parsing.
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '1mb' }));

  // Product images — proper file storage with basic serving
  app.use(
    '/uploads',
    express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' })
  );

  app.get('/api/v1/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1', rateLimit({ name: 'global', capacity: 120, refillPerSec: 2 }));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1', catalogRoutes);
  app.use('/api/v1/cart', cartRoutes);
  app.use('/api/v1', orderRoutes);
  app.use('/api/v1/payments', paymentRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
