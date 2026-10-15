import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThumbsUp, BadgeCheck, Trash2, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import Stars, { StarPicker } from './Stars';
import FormField from '../FormField';

const SORTS = [
  ['helpful', 'Most helpful'],
  ['recent', 'Most recent'],
  ['highest', 'Highest rated'],
  ['lowest', 'Lowest rated'],
];

function Distribution({ distribution, total }) {
  return (
    <ul className="space-y-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <li key={star} className="flex items-center gap-2 text-xs">
            <span className="w-10 text-gray-600">{star} star</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span
                className="block h-full rounded-full bg-amber-400"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-8 text-right text-gray-500">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function ProductReviews({ slug, onRatingChange }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [sort, setSort] = useState('helpful');
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', body: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api(`/products/${slug}/reviews?sort=${sort}&page=${page}`);
      setData(d);
    } catch {
      setData(null);
    }
  }, [slug, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitReview(e) {
    e.preventDefault();
    const next = {};
    if (!form.rating) next.rating = 'Choose a rating';
    if (form.body.trim().length < 10) next.body = 'Please write at least 10 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setNotice('');
    try {
      const payload = { rating: form.rating, body: form.body.trim() };
      if (form.title.trim()) payload.title = form.title.trim();

      const res = editingId
        ? await api(`/reviews/${editingId}`, { method: 'PATCH', body: payload })
        : await api(`/products/${slug}/reviews`, { method: 'POST', body: payload });

      setWriting(false);
      setEditingId(null);
      setForm({ rating: 0, title: '', body: '' });
      setNotice('Thanks — your review is published.');
      onRatingChange?.(res.rating);
      await load();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const [editingId, setEditingId] = useState(null);

  async function onHelpful(review) {
    if (!user) return;
    try {
      const res = await api(`/reviews/${review.id}/helpful`, {
        method: 'POST',
        body: { helpful: true },
      });
      setData((d) => ({
        ...d,
        reviews: d.reviews.map((r) =>
          r.id === review.id
            ? { ...r, helpfulCount: res.helpfulCount, viewerFoundHelpful: res.viewerFoundHelpful }
            : r
        ),
      }));
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function onDelete(review) {
    try {
      const res = await api(`/reviews/${review.id}`, { method: 'DELETE' });
      onRatingChange?.(res.rating);
      await load();
    } catch (err) {
      setNotice(err.message);
    }
  }

  function startEdit(review) {
    setEditingId(review.id);
    setForm({ rating: review.rating, title: review.title || '', body: review.body });
    setWriting(true);
  }

  if (!data) return null;

  const { summary, reviews, total, totalPages, viewerReviewId } = data;

  return (
    <section aria-labelledby="reviews-heading" className="mt-12">
      <h2 id="reviews-heading" className="mb-4 text-lg font-semibold text-gray-900">
        Customer reviews
      </h2>

      <div className="grid gap-6 rounded-2xl border border-gray-200 bg-white p-5 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <p className="text-3xl font-bold text-gray-900">{summary.average.toFixed(1)}</p>
          <Stars value={summary.average} size="md" />
          <p className="mt-1 text-sm text-gray-600">
            {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
          </p>
          <div className="mt-4">
            <Distribution distribution={summary.distribution} total={summary.count} />
          </div>
        </div>

        <div>
          {notice && (
            <p role="status" className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              {notice}
            </p>
          )}

          {!user && (
            <p className="text-sm text-gray-600">
              <Link to="/login" className="font-medium text-brand-700 hover:underline">
                Log in
              </Link>{' '}
              to write a review.
            </p>
          )}

          {user && !writing && (
            <button
              type="button"
              onClick={() => {
                setWriting(true);
                setEditingId(viewerReviewId);
                const mine = reviews.find((r) => r.id === viewerReviewId);
                if (mine) setForm({ rating: mine.rating, title: mine.title || '', body: mine.body });
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {viewerReviewId ? 'Edit your review' : 'Write a review'}
            </button>
          )}

          {user && writing && (
            <form onSubmit={submitReview} noValidate className="space-y-3">
              <StarPicker
                value={form.rating}
                onChange={(rating) => {
                  setForm((f) => ({ ...f, rating }));
                  setErrors((e) => ({ ...e, rating: null }));
                }}
                error={errors.rating}
              />
              <FormField
                label="Title (optional)"
                value={form.title}
                onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                maxLength={150}
              />
              <div>
                <label
                  htmlFor="review-body"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Your review <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="review-body"
                  rows={4}
                  value={form.body}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, body: e.target.value }));
                    setErrors((er) => ({ ...er, body: null }));
                  }}
                  aria-invalid={errors.body ? 'true' : undefined}
                  aria-describedby={errors.body ? 'review-body-error' : undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    errors.body
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                />
                {errors.body && (
                  <p id="review-body-error" role="alert" className="mt-1 text-xs text-red-600">
                    {errors.body}
                  </p>
                )}
              </div>
              {errors.form && (
                <p role="alert" className="text-sm text-red-600">
                  {errors.form}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? 'Publishing…' : editingId ? 'Save changes' : 'Publish review'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWriting(false);
                    setEditingId(null);
                    setErrors({});
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {reviews.length} of {total}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Sort</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  {r.title && <h3 className="text-sm font-semibold text-gray-900">{r.title}</h3>}
                  {r.verifiedPurchase && (
                    <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      Verified purchase
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {r.author} ·{' '}
                  <time dateTime={r.createdAt}>
                    {new Date(r.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {r.body}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onHelpful(r)}
                    disabled={!user || r.id === viewerReviewId}
                    aria-pressed={r.viewerFoundHelpful === true}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                      r.viewerFoundHelpful
                        ? 'border-brand-400 bg-brand-50 text-brand-800'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                    title={!user ? 'Log in to vote' : undefined}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Helpful ({r.helpfulCount})
                  </button>

                  {r.id === viewerReviewId && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-700"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Review pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
