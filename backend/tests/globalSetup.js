// Runs once before the whole suite. Creates shop_test if needed, then resets
// it to a known state.
//
// The reset matters: tests place orders, which decrement stock permanently.
// Without it the database drifts a little further from the seed on every run
// until `pickProduct()` finds nothing in stock and a dozen unrelated tests
// fail for a reason that has nothing to do with the code. Starting from the
// same data every time also means a failure is reproducible.
const { Client } = require('pg');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';

  const adminUrl =
    process.env.ADMIN_DATABASE_URL || 'postgres://shop:shop_secret@localhost:5433/shop';
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'shop_test'");
  if (existing.rowCount === 0) await admin.query('CREATE DATABASE shop_test');
  await admin.end();

  const knex = require('knex');
  const knexfile = require('../knexfile');
  const db = knex(knexfile.test);

  await db.migrate.latest();

  // Wipe every table the seeds own, in one statement so foreign keys do not
  // dictate the order, then reseed. knex_migrations is deliberately excluded.
  const { rows } = await db.raw(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE 'knex_%'
  `);
  if (rows.length) {
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await db.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }

  await db.seed.run();
  await db.destroy();
};
