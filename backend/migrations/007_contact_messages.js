exports.up = async function up(knex) {
  await knex.schema.createTable('contact_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // Nullable: guests may write in too. Set when a signed-in shopper does.
    t.uuid('user_id').references('users.id').onDelete('SET NULL');
    t.string('name', 120).notNullable();
    // The sender's address is PII and the message body routinely contains
    // more of it ("my order went to the wrong street"), so both are stored
    // AES-256-GCM encrypted, the same as order addresses.
    t.text('email_enc').notNullable();
    t.text('body_enc').notNullable();
    t.string('subject', 150).notNullable();
    t.enu('topic', ['order', 'product', 'returns', 'technical', 'other'], {
      useNative: true,
      enumName: 'contact_topic',
    }).notNullable();
    // An order reference the sender quoted, so support can jump straight to it.
    t.string('order_reference', 32);
    t.enu('status', ['new', 'in_progress', 'closed'], {
      useNative: true,
      enumName: 'contact_status',
    })
      .notNullable()
      .defaultTo('new');
    t.uuid('handled_by').references('users.id').onDelete('SET NULL');
    t.timestamp('handled_at');
    t.timestamps(true, true);
    t.index(['status', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('contact_messages');
  await knex.raw('DROP TYPE IF EXISTS contact_topic');
  await knex.raw('DROP TYPE IF EXISTS contact_status');
};
