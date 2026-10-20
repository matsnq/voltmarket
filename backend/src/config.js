require('./lib/loadEnv');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'https://localhost',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://shop:shop_secret@localhost:5433/shop',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    from: process.env.MAIL_FROM || 'Voltmarket <no-reply@voltmarket.local>',
    // Where the contact form delivers. In dev this lands in Mailpit.
    supportInbox: process.env.SUPPORT_INBOX || 'support@voltmarket.local',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    accessTtlMin: parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '15', 10),
    refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),
  },
  // 32-byte hex key for AES-256-GCM field encryption of PII at rest
  fieldEncryptionKey:
    process.env.FIELD_ENCRYPTION_KEY ||
    '6f1d9c1e6a1b4f8e9d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e',
  recaptchaSecret:
    process.env.RECAPTCHA_SECRET || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
  // Public site key, served to the SPA via GET /auth/config (runtime config,
  // twelve-factor style — no frontend rebuild to change keys).
  recaptchaSiteKey:
    process.env.RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publicKey: process.env.STRIPE_PUBLIC_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
};
