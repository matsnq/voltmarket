const bcrypt = require('bcryptjs');

// Idempotent: skips if the admin already exists, so `docker compose up`
// can run seeds on every boot without duplicating data.
exports.seed = async function seed(knex) {
  const existing = await knex('users').where({ email: 'admin@voltmarket.local' }).first();
  if (existing) return;

  await knex('users').insert([
    {
      email: 'admin@voltmarket.local',
      password_hash: bcrypt.hashSync('Admin123!', 10),
      name: 'Site Admin',
      role: 'admin',
      email_verified: true,
    },
    {
      email: 'demo@voltmarket.local',
      password_hash: bcrypt.hashSync('Demo123!', 10),
      name: 'Demo Customer',
      role: 'customer',
      email_verified: true,
    },
  ]);
};
