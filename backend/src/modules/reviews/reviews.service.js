const db = require('../../lib/db');
const { HttpError } = require('../../middleware/errorHandler');

const APPROVED = 'approved';

// products.rating_avg / rating_count are denormalised so listing pages need no
// aggregate join. That is a deliberate read optimisation, and the price is
// that every write which could change a product's rating must recompute it —
// here, in one place, inside the caller's transaction.
async function recomputeRating(trx, productId) {
  const row = await trx('reviews')
    .where({ product_id: productId, status: APPROVED })
    .select(trx.raw('coalesce(avg(rating), 0) as avg'), trx.raw('count(*) as count'))
    .first();
  await trx('products')
    .where({ id: productId })
    .update({
      rating_avg: Number(row.avg).toFixed(2),
      rating_count: Number(row.count),
      updated_at: trx.fn.now(),
    });
  return { average: Number(Number(row.avg).toFixed(2)), count: Number(row.count) };
}

// A review counts as a verified purchase only if this person actually bought
// the product and the order got far enough to mean money changed hands.
async function hasPurchased(trx, userId, productId) {
  const row = await trx('order_items')
    .join('orders', 'orders.id', 'order_items.order_id')
    .where('orders.user_id', userId)
    .where('order_items.product_id', productId)
    .whereIn('orders.status', ['paid', 'processing', 'shipped', 'delivered'])
    .first();
  return Boolean(row);
}

function serialize(review, { viewerVote = null } = {}) {
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    author: review.author_snapshot,
    verifiedPurchase: review.verified_purchase,
    helpfulCount: review.helpful_count,
    viewerFoundHelpful: viewerVote,
    status: review.status,
    createdAt: review.created_at,
  };
}

async function create(productId, userId, { rating, title, body }) {
  const product = await db('products').where({ id: productId, is_active: true }).first();
  if (!product) throw new HttpError(404, 'Product not found');

  const user = await db('users').where({ id: userId }).first();
  const existing = await db('reviews').where({ product_id: productId, user_id: userId }).first();
  if (existing) {
    throw new HttpError(409, 'You have already reviewed this product. Edit your review instead.');
  }

  return db.transaction(async (trx) => {
    const verified = await hasPurchased(trx, userId, productId);
    const [review] = await trx('reviews')
      .insert({
        product_id: productId,
        user_id: userId,
        author_snapshot: user.name,
        rating,
        title: title || null,
        body,
        verified_purchase: verified,
        status: APPROVED, // published immediately; moderation is reactive
      })
      .returning('*');
    const rollup = await recomputeRating(trx, productId);
    return { review: serialize(review), rating: rollup };
  });
}

async function update(reviewId, userId, { rating, title, body }) {
  return db.transaction(async (trx) => {
    const review = await trx('reviews').where({ id: reviewId }).first();
    if (!review) throw new HttpError(404, 'Review not found');
    if (review.user_id !== userId) throw new HttpError(403, 'This is not your review');

    const [updated] = await trx('reviews')
      .where({ id: reviewId })
      .update({
        rating: rating ?? review.rating,
        title: title !== undefined ? title : review.title,
        body: body ?? review.body,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    const rollup = await recomputeRating(trx, review.product_id);
    return { review: serialize(updated), rating: rollup };
  });
}

async function remove(reviewId, userId, { byAdmin = false } = {}) {
  return db.transaction(async (trx) => {
    const review = await trx('reviews').where({ id: reviewId }).first();
    if (!review) throw new HttpError(404, 'Review not found');
    if (!byAdmin && review.user_id !== userId) throw new HttpError(403, 'This is not your review');
    await trx('reviews').where({ id: reviewId }).del();
    return recomputeRating(trx, review.product_id);
  });
}

async function listForProduct(productId, { viewerId, sort = 'helpful', page = 1, perPage = 10 } = {}) {
  const base = db('reviews').where({ product_id: productId, status: APPROVED });

  const [{ count }] = await base.clone().count('* as count');

  const query = base.clone();
  if (sort === 'recent') query.orderBy('created_at', 'desc');
  else if (sort === 'highest') query.orderBy([{ column: 'rating', order: 'desc' }, { column: 'helpful_count', order: 'desc' }]);
  else if (sort === 'lowest') query.orderBy([{ column: 'rating', order: 'asc' }, { column: 'helpful_count', order: 'desc' }]);
  else query.orderBy([{ column: 'helpful_count', order: 'desc' }, { column: 'created_at', order: 'desc' }]);

  const rows = await query.limit(perPage).offset((page - 1) * perPage);

  // Which of these the viewer already voted on, so the UI can show state.
  let votes = {};
  if (viewerId && rows.length) {
    const voted = await db('review_votes')
      .whereIn('review_id', rows.map((r) => r.id))
      .where({ user_id: viewerId });
    votes = Object.fromEntries(voted.map((v) => [v.review_id, v.helpful]));
  }

  // Distribution powers the 5★/4★/3★ bars on the product page.
  const spread = await db('reviews')
    .where({ product_id: productId, status: APPROVED })
    .groupBy('rating')
    .select('rating')
    .count('* as count');
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of spread) distribution[s.rating] = Number(s.count);

  const product = await db('products').where({ id: productId }).first();

  return {
    reviews: rows.map((r) => serialize(r, { viewerVote: votes[r.id] ?? null })),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
    summary: {
      average: product ? Number(product.rating_avg) : 0,
      count: product ? product.rating_count : 0,
      distribution,
    },
    viewerReviewId: viewerId
      ? (await db('reviews').where({ product_id: productId, user_id: viewerId }).first())?.id || null
      : null,
  };
}

// "Was this helpful?" — one vote per person, and voting again flips it off,
// so the count cannot be inflated by clicking repeatedly.
async function vote(reviewId, userId, helpful) {
  return db.transaction(async (trx) => {
    const review = await trx('reviews').where({ id: reviewId }).forUpdate().first();
    if (!review) throw new HttpError(404, 'Review not found');
    if (review.user_id === userId) {
      throw new HttpError(409, 'You cannot vote on your own review');
    }

    const existing = await trx('review_votes').where({ review_id: reviewId, user_id: userId }).first();
    if (existing && existing.helpful === helpful) {
      await trx('review_votes').where({ id: existing.id }).del(); // toggle off
    } else if (existing) {
      await trx('review_votes').where({ id: existing.id }).update({ helpful });
    } else {
      await trx('review_votes').insert({ review_id: reviewId, user_id: userId, helpful });
    }

    // Recount rather than increment: a counter that drifts from its votes is
    // worse than one extra query.
    const [{ count }] = await trx('review_votes')
      .where({ review_id: reviewId, helpful: true })
      .count('* as count');
    await trx('reviews').where({ id: reviewId }).update({ helpful_count: Number(count) });

    const mine = await trx('review_votes').where({ review_id: reviewId, user_id: userId }).first();
    return { helpfulCount: Number(count), viewerFoundHelpful: mine ? mine.helpful : null };
  });
}

// ---------- Moderation (admin / support) ----------

async function listForModeration({ status, page = 1, perPage = 20 } = {}) {
  const query = db('reviews')
    .join('products', 'products.id', 'reviews.product_id')
    .select(
      'reviews.*',
      'products.name as product_name',
      'products.slug as product_slug'
    );
  if (status) query.where('reviews.status', status);

  const [{ count }] = await db('reviews')
    .modify((q) => (status ? q.where({ status }) : q))
    .count('* as count');

  const rows = await query
    .orderBy('reviews.created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    reviews: rows.map((r) => ({
      ...serialize(r),
      product: { name: r.product_name, slug: r.product_slug },
      moderationNote: r.moderation_note,
    })),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}

async function moderate(reviewId, moderatorId, { status, note }) {
  return db.transaction(async (trx) => {
    const review = await trx('reviews').where({ id: reviewId }).first();
    if (!review) throw new HttpError(404, 'Review not found');

    const [updated] = await trx('reviews')
      .where({ id: reviewId })
      .update({
        status,
        moderation_note: note || null,
        moderated_by: moderatorId,
        moderated_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');

    // A rejected review must stop counting towards the product's rating.
    const rollup = await recomputeRating(trx, review.product_id);

    await trx('audit_logs').insert({
      user_id: moderatorId,
      action: `review.${status}`,
      entity: 'reviews',
      entity_id: reviewId,
      meta: JSON.stringify({ from: review.status, to: status, note: note || null }),
    });

    return { review: serialize(updated), rating: rollup };
  });
}

module.exports = {
  create,
  update,
  remove,
  listForProduct,
  vote,
  listForModeration,
  moderate,
  recomputeRating,
  hasPurchased,
  serialize,
};
