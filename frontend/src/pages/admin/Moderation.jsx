import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, X, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Pagination, Banner, Pill, btn } from '../../components/admin/ui';
import Stars from '../../components/reviews/Stars';

const TONES = { approved: 'green', pending: 'amber', rejected: 'red' };

export default function Moderation() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null); // review id whose note form is open
  const [note, setNote] = useState('');
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) qs.set(k, v);
    try { setData(await api(`/admin/reviews?${qs}`)); } catch (e) { setBanner(e.message); }
  }, [params]);
  useEffect(() => { load(); }, [load]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (!v) next.delete(k); else next.set(k, v); }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  async function moderate(review, newStatus, moderationNote) {
    setBusy(review.id); setBanner('');
    try {
      const body = { status: newStatus };
      if (moderationNote) body.note = moderationNote;
      const res = await api(`/admin/reviews/${review.id}`, { method: 'PATCH', body });
      setBanner(`Review ${newStatus}. "${review.product.name}" is now rated ${res.rating.average} from ${res.rating.count} review(s).`);
      setRejecting(null); setNote('');
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(null); }
  }

  async function remove(review) {
    if (!window.confirm('Delete this review permanently?')) return;
    setBusy(review.id);
    try {
      await api(`/admin/reviews/${review.id}`, { method: 'DELETE' });
      setBanner('Review deleted.');
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <Helmet><title>Review Moderation — Voltmarket Admin</title></Helmet>
      <Banner tone={banner.startsWith('Review') ? 'green' : 'red'} onDismiss={() => setBanner('')}>{banner}</Banner>

      <Panel title={data ? `${data.total} reviews` : 'Reviews'}>
        <div className="mb-4 flex flex-wrap gap-2">
          {['', 'pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => update({ status: s })}
              aria-pressed={status === s}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                status === s ? 'bg-brand-50 font-semibold text-brand-800' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>

        {data && data.reviews.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nothing to moderate here.</p>
        )}

        <ul className="space-y-3">
          {data?.reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <Pill tone={TONES[r.status]}>{r.status}</Pill>
                {r.verifiedPurchase && <Pill tone="green">verified purchase</Pill>}
                <Link to={`/products/${r.product.slug}`} className="text-xs text-brand-700 hover:underline">
                  {r.product.name}
                </Link>
              </div>
              {r.title && <h3 className="mt-1 text-sm font-semibold text-gray-900">{r.title}</h3>}
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{r.body}</p>
              <p className="mt-1 text-xs text-gray-500">
                {r.author} · {new Date(r.createdAt).toLocaleDateString('en-GB')}
                {r.moderationNote && <> · note: {r.moderationNote}</>}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {r.status !== 'approved' && (
                  <button type="button" disabled={busy === r.id} onClick={() => moderate(r, 'approved')}
                    className={`${btn.secondary} flex items-center gap-1`}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                  </button>
                )}
                {r.status !== 'rejected' && (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setNote(''); }}
                    aria-expanded={rejecting === r.id}
                    className={`${btn.secondary} flex items-center gap-1`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                  </button>
                )}
                {user.role === 'admin' && (
                  <button type="button" disabled={busy === r.id} onClick={() => remove(r)}
                    className={`${btn.danger} flex items-center gap-1`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                  </button>
                )}
              </div>

              {rejecting === r.id && (
                <form
                  onSubmit={(e) => { e.preventDefault(); moderate(r, 'rejected', note.trim()); }}
                  className="mt-3 rounded-lg bg-gray-50 p-3"
                >
                  <label htmlFor={`note-${r.id}`} className="mb-1 block text-xs font-medium text-gray-700">
                    Reason for rejecting (optional — stored in the audit log)
                  </label>
                  <textarea
                    id={`note-${r.id}`}
                    rows={2}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. advertising link, abusive language"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="submit" disabled={busy === r.id} className={btn.danger}>
                      Confirm rejection
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className={btn.secondary}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>

        {data && <Pagination page={page} totalPages={data.totalPages} onPage={(p) => update({ page: p })} />}
      </Panel>
    </div>
  );
}
