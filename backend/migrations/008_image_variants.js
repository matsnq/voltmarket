exports.up = async function up(knex) {
  // A thumbnail is a genuinely different asset, not the same file rendered
  // smaller: it drops the product text and detail that would be unreadable at
  // card size, and is a fraction of the bytes. Storing its path next to the
  // full-size one lets each view request what it actually needs.
  await knex.schema.alterTable('product_images', (t) => {
    t.string('thumb_path', 300);
    t.integer('width');
    t.integer('height');
    t.integer('thumb_width');
    t.integer('thumb_height');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('product_images', (t) => {
    t.dropColumn('thumb_path');
    t.dropColumn('width');
    t.dropColumn('height');
    t.dropColumn('thumb_width');
    t.dropColumn('thumb_height');
  });
};
