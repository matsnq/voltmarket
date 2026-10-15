exports.up = async function up(knex) {
  await knex.schema.createTable('reviews', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().references('products.id').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    // Snapshot of the author's name so a later profile edit does not silently
    // rewrite who said what, and deleting an account does not orphan the text.
    t.string('author_snapshot', 120).notNullable();
    t.integer('rating').notNullable();
    t.string('title', 150);
    t.text('body').notNullable();
    // Only reviews tied to a delivered/paid order get the badge.
    t.boolean('verified_purchase').notNullable().defaultTo(false);
    t.enu('status', ['pending', 'approved', 'rejected'], {
      useNative: true,
      enumName: 'review_status',
    })
      .notNullable()
      .defaultTo('approved');
    t.text('moderation_note');
    t.uuid('moderated_by').references('users.id').onDelete('SET NULL');
    t.timestamp('moderated_at');
    t.integer('helpful_count').notNullable().defaultTo(0);
    t.timestamps(true, true);
    // One review per person per product — otherwise ratings are trivially gamed.
    t.unique(['product_id', 'user_id']);
    t.index(['product_id', 'status']);
    t.index(['status']);
  });
  await knex.raw('ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)');

  await knex.schema.createTable('review_votes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('review_id').notNullable().references('reviews.id').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.boolean('helpful').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['review_id', 'user_id']); // one vote each, changeable
    t.index(['review_id']);
  });

  // products.rating_avg / rating_count were seeded with invented numbers.
  // From here they are derived from approved reviews only, recomputed by the
  // application whenever a review is written, moderated or removed.
  await knex('products').update({ rating_avg: 0, rating_count: 0 });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('review_votes');
  await knex.schema.dropTableIfExists('reviews');
  await knex.raw('DROP TYPE IF EXISTS review_status');
};
