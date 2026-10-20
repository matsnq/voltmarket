require('./src/lib/loadEnv');

const base = {
  client: 'pg',
  connection:
    process.env.DATABASE_URL ||
    'postgres://shop:shop_secret@localhost:5433/shop',
  pool: { min: 2, max: 10 },
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
};

module.exports = {
  development: base,
  production: base,
  test: {
    ...base,
    connection:
      process.env.TEST_DATABASE_URL ||
      'postgres://shop:shop_secret@localhost:5433/shop_test',
  },
};
