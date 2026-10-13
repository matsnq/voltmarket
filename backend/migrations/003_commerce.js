exports.up = async function up(knex) {
  // ---------- Addresses (PII encrypted at rest) ----------
  await knex.schema.createTable('addresses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('label', 60);
    t.text('recipient_enc').notNullable();
    t.text('street_enc').notNullable();
    t.string('city', 120).notNullable();
    t.string('postal_code', 20).notNullable();
    t.string('country', 2).notNullable(); // ISO 3166-1 alpha-2
    t.text('phone_enc');
    t.boolean('is_default').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index(['user_id']);
  });

  // ---------- Carts ----------
  // A cart belongs to a user OR to a guest (cookie token), never both.
  // Guest carts expire; user carts persist across sessions.
  await knex.schema.createTable('carts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('users.id').onDelete('CASCADE');
    t.string('guest_token', 64).unique();
    t.timestamp('expires_at'); // guest carts only
    t.timestamps(true, true);
    t.index(['user_id']);
  });
  await knex.raw(`
    ALTER TABLE carts ADD CONSTRAINT carts_owner_exactly_one
      CHECK ((user_id IS NOT NULL AND guest_token IS NULL)
          OR (user_id IS NULL AND guest_token IS NOT NULL))
  `);
  // One active cart per user.
  await knex.raw('CREATE UNIQUE INDEX carts_one_per_user ON carts (user_id) WHERE user_id IS NOT NULL');

  await knex.schema.createTable('cart_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('cart_id').notNullable().references('carts.id').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('products.id').onDelete('CASCADE');
    t.integer('quantity').notNullable();
    t.timestamps(true, true);
    t.unique(['cart_id', 'product_id']); // same product once, with a quantity
  });
  await knex.raw('ALTER TABLE cart_items ADD CONSTRAINT cart_items_qty_positive CHECK (quantity > 0)');

  // ---------- Shipping ----------
  await knex.schema.createTable('shipping_methods', (t) => {
    t.increments('id');
    t.string('code', 40).notNullable().unique();
    t.string('name', 120).notNullable();
    t.text('description');
    t.integer('price_cents').notNullable();
    t.integer('eta_days_min').notNullable();
    t.integer('eta_days_max').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
  });
  await knex.raw('ALTER TABLE shipping_methods ADD CONSTRAINT shipping_price_nonnegative CHECK (price_cents >= 0)');

  // ---------- Orders ----------
  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('reference', 20).notNullable().unique(); // human-facing, e.g. VM-2K7F4D
    t.uuid('user_id').references('users.id').onDelete('SET NULL'); // null = guest order
    t.string('email', 255).notNullable(); // always captured, guest or not
    t.enu(
      'status',
      [
        'pending_payment',
        'paid',
        'payment_failed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
      ],
      { useNative: true, enumName: 'order_status' }
    )
      .notNullable()
      .defaultTo('pending_payment');
    t.integer('subtotal_cents').notNullable();
    t.integer('shipping_cents').notNullable().defaultTo(0);
    t.integer('total_cents').notNullable();
    t.string('currency', 3).notNullable().defaultTo('EUR');
    t.integer('shipping_method_id').references('shipping_methods.id');
    // Address is snapshotted onto the order: editing a saved address later
    // must not rewrite where a past order was shipped.
    t.text('shipping_address_enc').notNullable();
    t.string('tracking_number', 80);
    t.text('cancel_reason');
    t.timestamp('paid_at');
    t.timestamp('shipped_at');
    t.timestamp('cancelled_at');
    t.timestamps(true, true);
    t.index(['user_id']);
    t.index(['status']);
    t.index(['created_at']);
  });

  await knex.schema.createTable('order_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('orders.id').onDelete('CASCADE');
    t.uuid('product_id').references('products.id').onDelete('SET NULL');
    // Snapshots: order history must survive catalog edits and deletions.
    t.string('name_snapshot', 200).notNullable();
    t.string('slug_snapshot', 220);
    t.string('image_snapshot', 300);
    t.integer('price_cents_snapshot').notNullable();
    t.integer('quantity').notNullable();
    t.integer('line_total_cents').notNullable();
    t.index(['order_id']);
  });
  await knex.raw('ALTER TABLE order_items ADD CONSTRAINT order_items_qty_positive CHECK (quantity > 0)');

  // ---------- Payments ----------
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('orders.id').onDelete('CASCADE');
    t.string('provider', 20).notNullable().defaultTo('stripe');
    // No card data is ever stored — only the provider's reference.
    t.string('provider_payment_id', 120).unique();
    t.enu('status', ['pending', 'succeeded', 'failed', 'cancelled'], {
      useNative: true,
      enumName: 'payment_status',
    })
      .notNullable()
      .defaultTo('pending');
    t.integer('amount_cents').notNullable();
    t.string('currency', 3).notNullable().defaultTo('EUR');
    t.string('failure_code', 60);
    t.text('failure_message');
    t.timestamps(true, true);
    t.index(['order_id']);
  });

  await knex.schema.createTable('refunds', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('orders.id').onDelete('CASCADE');
    t.uuid('payment_id').references('payments.id').onDelete('SET NULL');
    t.string('provider_refund_id', 120).unique();
    t.integer('amount_cents').notNullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    t.text('reason');
    t.uuid('created_by').references('users.id').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['order_id']);
  });

  // ---------- Idempotency ----------
  // Stripe delivers webhooks at-least-once and RabbitMQ redelivers on nack,
  // so every side effect is guarded by a unique event key. Inserting is the
  // lock: a duplicate violates the primary key and is skipped.
  await knex.schema.createTable('processed_events', (t) => {
    t.string('event_key', 160).primary();
    t.string('source', 30).notNullable(); // 'stripe' | 'queue'
    t.jsonb('meta');
    t.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());
  });

  // ---------- Order status history (customer-visible timeline) ----------
  await knex.schema.createTable('order_events', (t) => {
    t.bigIncrements('id');
    t.uuid('order_id').notNullable().references('orders.id').onDelete('CASCADE');
    t.string('status', 30).notNullable();
    t.text('note');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['order_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('order_events');
  await knex.schema.dropTableIfExists('processed_events');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('shipping_methods');
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.dropTableIfExists('carts');
  await knex.schema.dropTableIfExists('addresses');
  await knex.raw('DROP TYPE IF EXISTS payment_status');
  await knex.raw('DROP TYPE IF EXISTS order_status');
};
