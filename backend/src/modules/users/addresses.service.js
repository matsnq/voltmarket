const db = require('../../lib/db');
const { encryptField, decryptField } = require('../../lib/crypto');
const { HttpError } = require('../../middleware/errorHandler');

// Saved delivery addresses. Recipient, street and phone are PII and stored
// AES-256-GCM encrypted, the same as the snapshot taken onto an order.
function serialize(row) {
  return {
    id: row.id,
    label: row.label,
    recipient: decryptField(row.recipient_enc),
    street: decryptField(row.street_enc),
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone_enc ? decryptField(row.phone_enc) : null,
    isDefault: row.is_default,
  };
}

async function list(userId) {
  const rows = await db('addresses')
    .where({ user_id: userId })
    .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at' }]);
  return rows.map(serialize);
}

async function getDefault(userId) {
  const rows = await list(userId);
  return rows.find((a) => a.isDefault) || rows[0] || null;
}

function toRow(userId, a) {
  return {
    user_id: userId,
    label: a.label || null,
    recipient_enc: encryptField(a.recipient),
    street_enc: encryptField(a.street),
    city: a.city,
    postal_code: a.postalCode,
    country: a.country,
    phone_enc: a.phone ? encryptField(a.phone) : null,
  };
}

// Only one address per user may be the default.
async function clearDefaults(trx, userId, exceptId) {
  const q = trx('addresses').where({ user_id: userId }).update({ is_default: false });
  if (exceptId) q.whereNot('id', exceptId);
  await q;
}

async function create(userId, address, { isDefault = false } = {}) {
  return db.transaction(async (trx) => {
    const existing = await trx('addresses').where({ user_id: userId }).count('* as n').first();
    const first = Number(existing.n) === 0;
    const [row] = await trx('addresses')
      .insert({ ...toRow(userId, address), is_default: isDefault || first })
      .returning('*');
    if (row.is_default) await clearDefaults(trx, userId, row.id);
    return serialize(row);
  });
}

async function update(userId, id, address, { isDefault } = {}) {
  return db.transaction(async (trx) => {
    const owned = await trx('addresses').where({ id, user_id: userId }).first();
    if (!owned) throw new HttpError(404, 'Address not found');
    const patch = { ...toRow(userId, address), updated_at: trx.fn.now() };
    delete patch.user_id;
    if (isDefault !== undefined) patch.is_default = isDefault;
    const [row] = await trx('addresses').where({ id }).update(patch).returning('*');
    if (row.is_default) await clearDefaults(trx, userId, id);
    return serialize(row);
  });
}

async function remove(userId, id) {
  return db.transaction(async (trx) => {
    const row = await trx('addresses').where({ id, user_id: userId }).first();
    if (!row) throw new HttpError(404, 'Address not found');
    await trx('addresses').where({ id }).del();

    // Deleting the default would otherwise leave the account with none, so
    // the oldest remaining address inherits the flag. Checkout falls back to
    // the first address anyway, but an account that shows no default at all
    // looks broken.
    if (row.is_default) {
      const next = await trx('addresses')
        .where({ user_id: userId })
        .orderBy('created_at')
        .first();
      if (next) await trx('addresses').where({ id: next.id }).update({ is_default: true });
    }
  });
}

// Called after a successful checkout: remember where a signed-in shopper sent
// their order, unless they already have that exact address saved.
async function rememberFromCheckout(userId, address) {
  if (!userId) return null;
  const existing = await list(userId);
  const same = existing.find(
    (a) =>
      a.street === address.street &&
      a.postalCode === address.postalCode &&
      a.city === address.city &&
      a.country === address.country
  );
  if (same) return same;
  return create(userId, address, { isDefault: existing.length === 0 });
}

module.exports = { list, getDefault, create, update, remove, rememberFromCheckout, serialize };
