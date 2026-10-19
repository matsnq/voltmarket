const bcrypt = require('bcryptjs');

const USERS = [
  {
    email: 'admin@voltmarket.local',
    password: 'Admin123!',
    name: 'Site Admin',
    role: 'admin',
  },
  // Staff accounts for the two non-admin roles. Without these, role-based
  // access control can only be demonstrated by promoting someone first — and
  // the support/sales distinction (who may edit products, who may only read
  // orders) is invisible.
  {
    email: 'support@voltmarket.local',
    password: 'Support123!',
    name: 'Sofia Support',
    role: 'support',
  },
  {
    email: 'sales@voltmarket.local',
    password: 'Sales123!',
    name: 'Sander Sales',
    role: 'sales',
  },
  {
    email: 'demo@voltmarket.local',
    password: 'Demo123!',
    name: 'Demo Customer',
    role: 'customer',
  },
];

// Idempotent per account rather than all-or-nothing, so `docker compose up`
// can run the seeds on every boot without duplicating anyone — and so an
// account added here later still reaches a database that was seeded before.
exports.seed = async function seed(knex) {
  for (const user of USERS) {
    const existing = await knex('users').where({ email: user.email }).first();
    if (existing) continue;
    await knex('users').insert({
      email: user.email,
      password_hash: bcrypt.hashSync(user.password, 10),
      name: user.name,
      role: user.role,
      email_verified: true,
    });
  }
};
