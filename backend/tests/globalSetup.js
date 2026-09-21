// Runs once before the whole suite: creates the shop_test database if needed,
// then migrates and seeds it. Requires the dockerized postgres to be up
// (docker compose up -d postgres redis).
const { Client } = require('pg');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';

  const adminUrl =
    process.env.ADMIN_DATABASE_URL || 'postgres://shop:shop_secret@localhost:5433/shop';
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'shop_test'");
  if (existing.rowCount === 0) {
    await admin.query('CREATE DATABASE shop_test');
  }
  await admin.end();

  const knex = require('knex');
  const knexfile = require('../knexfile');
  const db = knex(knexfile.test);
  await db.migrate.latest();
  await db.seed.run();
  await db.destroy();
};
