// Orders carry PII that must not sit in the clear: the buyer's email address,
// and for guests it is the only identifier we hold.
//
// AES-256-GCM is randomised — encrypting the same email twice produces
// different ciphertext — so an encrypted column cannot be searched. The
// standard answer is a **blind index**: store the ciphertext for display and
// a deterministic keyed hash alongside it for equality lookups.
exports.up = async function up(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.text('email_enc'); // AES-256-GCM ciphertext
    t.string('email_hash', 64); // HMAC-SHA256 blind index for lookups
    t.index(['email_hash']);
  });

  // Backfill existing rows through the application's crypto helpers so the
  // key and algorithm stay in one place.
  const { encryptField, blindIndex } = require('../src/lib/crypto');
  const rows = await knex('orders').select('id', 'email').whereNotNull('email');
  for (const row of rows) {
    await knex('orders').where({ id: row.id }).update({
      email_enc: encryptField(row.email),
      email_hash: blindIndex(row.email.toLowerCase()),
    });
  }

  // Plaintext column goes away entirely — leaving it would defeat the point.
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('email');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.string('email', 255);
  });
  const { decryptField } = require('../src/lib/crypto');
  const rows = await knex('orders').select('id', 'email_enc').whereNotNull('email_enc');
  for (const row of rows) {
    await knex('orders').where({ id: row.id }).update({ email: decryptField(row.email_enc) });
  }
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('email_enc');
    t.dropColumn('email_hash');
  });
};
