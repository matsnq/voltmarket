import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Mail } from 'lucide-react';
import { api } from '../../lib/api';
import { Panel, Pagination, Banner, Pill, btn } from '../../components/admin/ui';

const TONES = { new: 'amber', in_progress: 'blue', closed: 'gray' };
const NEXT = { new: 'in_progress', in_progress: 'closed', closed: 'new' };
const ACTION_LABEL = { new: 'Start working', in_progress: 'Mark closed', closed: 'Reopen' };

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(null);
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) qs.set(k, v);
    try { setData(await api(`/admin/contact-messages?${qs}`)); } catch (e) { setBanner(e.message); }
  }, [params]);
  useEffect(() => { load(); }, [load]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (!v) next.delete(k); else next.set(k, v); }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  async function advance(message) {
    setBusy(message.id); setBanner('');
    try {
      await api(`/admin/contact-messages/${message.id}`, {
        method: 'PATCH',
        body: { status: NEXT[message.status] },
      });
      setBanner(`Message from ${message.name} marked ${NEXT[message.status].replace('_', ' ')}.`);
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <Helmet><title>Support Inbox — Voltmarket Admin</title></Helmet>
      <Banner tone={banner.startsWith('Message') ? 'green' : 'red'} onDismiss={() => setBanner('')}>
        {banner}
      </Banner>

      <Panel title={data ? `${data.total} messages` : 'Support inbox'}>
        <div className="mb-4 flex flex-wrap gap-2">
          {['', 'new', 'in_progress', 'closed'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => update({ status: s })}
              aria-pressed={status === s}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                status === s
                  ? 'bg-brand-50 font-semibold text-brand-800'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s ? s.replace('_', ' ') : 'All'}
            </button>
          ))}
        </div>

        {data && data.messages.length === 0 && (
          <div className="py-8 text-center">
            <Mail className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="text-sm text-gray-500">Nothing in this folder.</p>
          </div>
        )}

        <ul className="space-y-3">
          {data?.messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TONES[m.status]}>{m.status.replace('_', ' ')}</Pill>
                <Pill tone="gray">{m.topicLabel}</Pill>
                {m.orderReference && (
                  <Link
                    to={`/admin/orders/${m.orderReference}`}
                    className="text-xs font-mono text-brand-700 hover:underline"
                  >
                    {m.orderReference}
                  </Link>
                )}
                {!m.fromAccount && <Pill tone="gray">guest</Pill>}
              </div>

              <h3 className="mt-1 text-sm font-semibold text-gray-900">{m.subject}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{m.message}</p>
              <p className="mt-1 text-xs text-gray-500">
                {m.name} &lt;{m.email}&gt; · {new Date(m.receivedAt).toLocaleString('en-GB')}
                {m.handledBy && <> · last touched by {m.handledBy}</>}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                  className={btn.secondary}
                >
                  Reply by email
                </a>
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => advance(m)}
                  className={btn.primary}
                >
                  {ACTION_LABEL[m.status]}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {data && <Pagination page={page} totalPages={data.totalPages} onPage={(p) => update({ page: p })} />}
      </Panel>
    </div>
  );
}
