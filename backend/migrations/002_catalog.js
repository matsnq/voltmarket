exports.up = async function up(knex) {
  await knex.schema.createTable('categories', (t) => {
    t.increments('id');
    t.string('name', 120).notNullable();
    t.string('slug', 140).notNullable().unique();
    t.integer('parent_id').references('categories.id').onDelete('SET NULL');
    t.text('description');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('brands', (t) => {
    t.increments('id');
    t.string('name', 120).notNullable().unique();
    t.string('slug', 140).notNullable().unique();
    t.string('country', 60);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('slug', 220).notNullable().unique();
    t.text('description').notNullable();
    t.integer('price_cents').notNullable();
    t.string('currency', 3).notNullable().defaultTo('EUR');
    t.integer('stock_quantity').notNullable().defaultTo(0);
    t.integer('category_id').notNullable().references('categories.id');
    t.integer('brand_id').notNullable().references('brands.id');
    // Canonical metric measurements; imperial is derived via generated
    // columns below, so the two can never drift apart.
    t.decimal('weight_kg', 8, 2);
    t.integer('length_mm');
    t.integer('width_mm');
    t.integer('height_mm');
    // EV-specific attributes (null for accessories)
    t.integer('range_km');
    t.decimal('battery_kwh', 6, 1);
    t.integer('motor_power_kw');
    t.jsonb('attributes').notNullable().defaultTo('{}');
    // Denormalized rating (maintained by the reviews module)
    t.decimal('rating_avg', 3, 2).notNullable().defaultTo(0);
    t.integer('rating_count').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['category_id']);
    t.index(['brand_id']);
    t.index(['price_cents']);
    t.index(['rating_avg']);
  });

  await knex.raw('ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK (price_cents >= 0)');
  await knex.raw('ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock_quantity >= 0)');

  // Imperial units derived from metric — single source of truth (ACID
  // consistency talking point).
  await knex.raw(`
    ALTER TABLE products
      ADD COLUMN weight_lb numeric(8,2) GENERATED ALWAYS AS (round(weight_kg * 2.20462, 2)) STORED,
      ADD COLUMN length_in numeric(8,1) GENERATED ALWAYS AS (round(length_mm / 25.4, 1)) STORED,
      ADD COLUMN width_in  numeric(8,1) GENERATED ALWAYS AS (round(width_mm / 25.4, 1)) STORED,
      ADD COLUMN height_in numeric(8,1) GENERATED ALWAYS AS (round(height_mm / 25.4, 1)) STORED
  `);

  // Full-text search: weighted tsvector (name > description) kept in sync by
  // Postgres itself as a generated column; GIN-indexed. pg_trgm index powers
  // typo-tolerant live suggestions.
  await knex.raw(`
    ALTER TABLE products ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED
  `);
  await knex.raw('CREATE INDEX products_search_idx ON products USING GIN (search_vector)');
  await knex.raw('CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops)');

  await knex.schema.createTable('product_images', (t) => {
    t.increments('id');
    t.uuid('product_id').notNullable().references('products.id').onDelete('CASCADE');
    t.string('file_path', 300).notNullable();
    t.string('alt_text', 250).notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_primary').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['product_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('product_images');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('brands');
  await knex.schema.dropTableIfExists('categories');
};
