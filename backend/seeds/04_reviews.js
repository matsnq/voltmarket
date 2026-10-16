const bcrypt = require('bcryptjs');

// Ratings used to be invented numbers on the product row. They are now
// derived from these reviews, so the figure on a listing page is the average
// of text a reviewer can actually open and read.
const REVIEWERS = [
  ['Liis Tamm', 'liis.tamm@example.com'],
  ['Jaan Kask', 'jaan.kask@example.com'],
  ['Maarja Sepp', 'maarja.sepp@example.com'],
  ['Andres Lepik', 'andres.lepik@example.com'],
  ['Kadri Oja', 'kadri.oja@example.com'],
  ['Toomas Rand', 'toomas.rand@example.com'],
];

const CAR_REVIEWS = [
  [5, 'Exactly the range they promise', 'Two months of commuting and the real-world range matches the WLTP figure closely in mild weather. Winter costs maybe 20%, which is normal for any EV. Delivery and registration were handled without me chasing anyone.'],
  [4, 'Great car, firm ride', 'Nothing to fault in the drivetrain and the charging curve is excellent. The suspension is firmer than I expected on poor roads, so try one before you commit if you have a bad commute.'],
  [5, 'Replaced our diesel entirely', 'We kept the old car for six months expecting to need it. Sold it in the end. Charges overnight at home and we have not visited a petrol station since.'],
  [4, 'Software is the weak point', 'Mechanically superb. The infotainment occasionally needs a restart and the route planner underestimates cold-weather consumption. Updates have improved it.'],
  [3, 'Good car, long wait', 'No complaints about the vehicle itself. Delivery slipped twice and communication could have been better during the wait.'],
];

const ACCESSORY_REVIEWS = [
  [5, 'Installed in an afternoon', 'Electrician had it on the wall and commissioned in under two hours. The app is genuinely useful for scheduling around cheap night tariffs.'],
  [5, 'Does exactly what it says', 'No drama. Charges at full rate, cable is flexible even below freezing, and it has survived a winter outdoors without issue.'],
  [4, 'Solid, cable is stiff in cold', 'Build quality is good and it has never failed. The cable stiffens noticeably below about minus ten, which makes coiling it awkward.'],
  [4, 'Good value', 'Cheaper than the alternatives and I cannot tell the difference in use. Packaging was minimal, which I appreciated.'],
  [2, 'Mine arrived faulty', 'First unit would not pair with the app at all. Replacement arrived quickly and has worked perfectly since, so the support gets credit even if the first one did not.'],
];

function pick(arr, seed) {
  let h = 7;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return arr[h % arr.length];
}

exports.seed = async function seed(knex) {
  const existing = await knex('reviews').count('id as n').first();
  if (Number(existing.n) > 0) return; // idempotent

  // Reviewer accounts. Verified-purchase badges are earned below, not faked.
  const userIds = [];
  for (const [name, email] of REVIEWERS) {
    let user = await knex('users').where({ email }).first();
    if (!user) {
      [user] = await knex('users')
        .insert({
          email,
          password_hash: bcrypt.hashSync('Review123!', 10),
          name,
          email_verified: true,
        })
        .returning('*');
    }
    userIds.push(user);
  }

  const products = await knex('products').select('id', 'slug', 'range_km');

  for (const product of products) {
    const pool = product.range_km !== null ? CAR_REVIEWS : ACCESSORY_REVIEWS;
    // Two to four reviews per product, deterministic from the slug so
    // re-seeding gives the same catalogue.
    let h = 11;
    for (const c of product.slug) h = (h * 31 + c.charCodeAt(0)) % 100000;
    const howMany = 2 + (h % 3);

    for (let i = 0; i < howMany; i += 1) {
      const author = userIds[(h + i * 7) % userIds.length];
      const [rating, title, body] = pick(pool, `${product.slug}-${i}`);
      const [review] = await knex('reviews')
        .insert({
          product_id: product.id,
          user_id: author.id,
          author_snapshot: author.name,
          rating,
          title,
          body,
          verified_purchase: (h + i) % 3 !== 0, // most, not all
          status: 'approved',
          created_at: knex.raw(`now() - interval '${(h + i * 5) % 90} days'`),
        })
        .returning('*');

      // Insert real votes rather than writing helpful_count directly. A
      // counter with no rows behind it is a number that collapses the first
      // time someone actually votes — the same mistake the invented
      // rating_avg made.
      const voters = userIds.filter((u) => u.id !== author.id);
      const howManyVotes = (h + i * 13) % (voters.length + 1);
      for (let v = 0; v < howManyVotes; v += 1) {
        await knex('review_votes').insert({
          review_id: review.id,
          user_id: voters[v].id,
          helpful: true,
        });
      }
      await knex('reviews').where({ id: review.id }).update({ helpful_count: howManyVotes });
    }
  }

  // Two reviews awaiting moderation, so the admin queue is never empty.
  // They use their own accounts rather than a reviewer from the list above:
  // one of those may already have reviewed the product, and the unique
  // (product_id, user_id) constraint would then silently drop these.
  const flaggedAccounts = [
    ['Spam Bot', 'spam.bot@example.com', 1,
      'BUY CHEAP CHARGERS AT my-totally-legit-site.example',
      'Click my link for the best deals anywhere, limited time offer, do not miss out!!!'],
    ['Angry Customer', 'angry.customer@example.com', 1,
      'This is a disgrace',
      'Absolutely useless company, the staff are [redacted] and I will be telling everyone.'],
  ];

  for (let i = 0; i < flaggedAccounts.length; i += 1) {
    const [fname, femail, rating, title, body] = flaggedAccounts[i];
    let account = await knex('users').where({ email: femail }).first();
    if (!account) {
      [account] = await knex('users')
        .insert({
          email: femail,
          password_hash: bcrypt.hashSync('Review123!', 10),
          name: fname,
          email_verified: true,
        })
        .returning('*');
    }
    await knex('reviews').insert({
      product_id: products[i % products.length].id,
      user_id: account.id,
      author_snapshot: account.name,
      rating,
      title,
      body,
      verified_purchase: false,
      status: 'pending',
    });
  }

  // Derive every product's rating from the approved reviews just written.
  await knex.raw(`
    UPDATE products p SET
      rating_avg = coalesce(r.avg, 0),
      rating_count = coalesce(r.count, 0)
    FROM (
      SELECT product_id, round(avg(rating)::numeric, 2) AS avg, count(*) AS count
      FROM reviews WHERE status = 'approved' GROUP BY product_id
    ) r
    WHERE p.id = r.product_id
  `);
};
