// Stock is reserved when an order is placed, but nothing ever gave the
// reservation an end. Two problems followed:
//
//   1. A declined payment released the stock immediately — yet Stripe lets the
//      shopper try another card on the same PaymentIntent. The second attempt
//      could succeed against stock we had already given away.
//   2. An abandoned checkout held its stock forever.
//
// A reservation now has an expiry. A decline keeps the goods held so the
// retry can succeed; a sweeper releases anything the shopper walked away from.
exports.up = async function up(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.timestamp('reservation_expires_at');
    t.index(['reservation_expires_at']);
  });

  // Existing unpaid orders get a short grace period rather than being swept
  // away the moment this deploys.
  await knex('orders')
    .whereIn('status', ['pending_payment', 'payment_failed'])
    .update({ reservation_expires_at: knex.raw("now() + interval '60 minutes'") });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('reservation_expires_at');
  });
};
