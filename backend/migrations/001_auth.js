exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 100); // null for OAuth-only accounts
    t.string('name', 120).notNullable();
    t.text('phone_enc'); // PII, AES-256-GCM encrypted at rest
    t.enu('role', ['customer', 'support', 'sales', 'admin'], {
        useNative: true,
        enumName: 'user_role',
      })
      .notNullable()
      .defaultTo('customer');
    t.boolean('email_verified').notNullable().defaultTo(false);
    t.boolean('totp_enabled').notNullable().defaultTo(false);
    t.text('totp_secret_enc'); // encrypted TOTP secret
    t.jsonb('totp_recovery_codes'); // array of sha256-hashed one-time codes
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('oauth_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('provider', 30).notNullable();
    t.string('provider_user_id', 255).notNullable();
    t.timestamps(true, true);
    t.unique(['provider', 'provider_user_id']);
  });

  // Refresh tokens are stored hashed. `family_id` groups a rotation chain:
  // reuse of an already-used token revokes the entire family.
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.uuid('family_id').notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at');
    t.timestamp('revoked_at');
    t.string('user_agent', 255);
    t.string('ip', 45);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id']);
    t.index(['family_id']);
  });

  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id');
    t.uuid('user_id').references('users.id').onDelete('SET NULL');
    t.string('action', 80).notNullable();
    t.string('entity', 60);
    t.string('entity_id', 60);
    t.jsonb('meta');
    t.string('ip', 45);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('password_reset_tokens');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('oauth_accounts');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS user_role');
};
