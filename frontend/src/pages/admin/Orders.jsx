import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Table, Pagination, Banner, OrderStatus, btn } from '../../components/admin/ui';

const STATUSES = ['pending_payment', 'paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
// Mirrors the server's whitelist; the API is still the authority.
const NEXT = { paid: ['processing'], processing: ['shipped'], shipped: ['delivered'] };

export function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState('');
  const page = Number(params.get('page') || 1);
  const status = params.get('status') || '';

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) qs.set(k, v);
    try { setData(await api(`/admin/orders?${qs}`)); } catch (e) { setBanner(e.message); }
  }, [params]);
  useEffect(() => { load(); }, [load]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (!v) next.delete(k); else next.set(k, v); }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  return (
    <div>
      <Helmet><title>Orders — Voltmarket Admin</title></Helmet>
      <Banner onDismiss={() => setBanner('')}>{banner}</Banner>
      <Panel title={data ? `${data.total} orders` : 'Orders'}>
        <div className="mb-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="order-status">Filter by status</label>
          <select id="order-status" value={status} onChange={(e) => update({ status: e.target.value })}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {data && (
          <>
            <Table headers={['Reference', 'Customer', 'Status', 'Total', 'Tracking', 'Placed']}
              empty={data.orders.length === 0 ? 'No orders match.' : null}>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-2 py-2">
                    <Link to={`/admin/orders/${o.reference}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link>
                  </td>
                  <td className="px-2 py-2 text-gray-600">{o.email}</td>
                  <td className="px-2 py-2"><OrderStatus status={o.status} /></td>
                  <td className="whitespace-nowrap px-2 py-2">{o.total.formatted}</td>
                  <td className="px-2 py-2 text-xs text-gray-500">{o.trackingNumber || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-gray-500">{new Date(o.placedAt).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} totalPages={data.totalPages} onPage={(p) => update({ page: p })} />
          </>
        )}
      </Panel>
    </div>
  );
}

export function AdminOrderDetail() {
  const { reference } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [banner, setBanner] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/admin/orders/${reference}`);
      setOrder(d.order);
      setTracking(d.order.trackingNumber || '');
    } catch (e) { setBanner(e.message); }
  }, [reference]);
  useEffect(() => { load(); }, [load]);

  async function advance(status) {
    setBusy(true); setBanner('');
    try {
      await api(`/orders/${reference}/fulfilment`, {
        method: 'PATCH',
        body: { status, ...(tracking.trim() ? { trackingNumber: tracking.trim() } : {}) },
      });
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(false); }
  }

  async function refund() {
    if (!window.confirm('Refund this order in full?')) return;
    setBusy(true); setBanner('');
    try {
      const res = await api(`/orders/${reference}/refund`, { method: 'POST', body: {} });
      setBanner(`Refunded €${(res.refund.amountCents / 100).toFixed(2)}.`);
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(false); }
  }

  if (!order) return <Banner>{banner || 'Loading…'}</Banner>;

  const canFulfil = ['admin', 'sales'].includes(user.role);
  const canRefund = ['admin', 'support'].includes(user.role);
  const nextSteps = NEXT[order.status] || [];

  return (
    <div className="space-y-4">
      <Helmet><title>{`Order ${order.reference} — Voltmarket Admin`}</title></Helmet>
      <Banner tone={banner.startsWith('Refunded') ? 'green' : 'red'} onDismiss={() => setBanner('')}>{banner}</Banner>

      <Panel
        title={`Order ${order.reference}`}
        action={<button type="button" onClick={() => navigate('/admin/orders')} className={btn.secondary}>Back to orders</button>}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <OrderStatus status={order.status} />
          <span className="text-sm text-gray-600">{order.email}</span>
          <span className="text-sm font-semibold text-gray-900">{order.total.formatted}</span>
        </div>

        {(canFulfil || canRefund) && (
          <div className="mb-4 rounded-xl bg-gray-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Fulfilment</h3>
            {nextSteps.length === 0 && (
              <p className="text-sm text-gray-600">
                No fulfilment step available from <strong>{order.status.replace(/_/g, ' ')}</strong>.
              </p>
            )}
            {canFulfil && nextSteps.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="tracking" className="mb-1 block text-xs font-medium text-gray-700">
                    Tracking number (optional)
                  </label>
                  <input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)}
                    placeholder="EE 1234 5678 9EE"
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
                </div>
                {nextSteps.map((s) => (
                  <button key={s} type="button" disabled={busy} onClick={() => advance(s)} className={btn.primary}>
                    Mark {s}
                  </button>
                ))}
              </div>
            )}
            {canRefund && ['paid', 'processing', 'shipped', 'delivered'].includes(order.status) && (
              <button type="button" disabled={busy} onClick={refund} className={`${btn.danger} mt-2`}>
                Refund in full
              </button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery</h3>
            {order.shippingAddress ? (
              <address className="text-sm not-italic text-gray-800">
                {order.shippingAddress.recipient}<br />
                {order.shippingAddress.street}<br />
                {order.shippingAddress.postalCode} {order.shippingAddress.city}<br />
                {order.shippingAddress.country}
              </address>
            ) : <p className="text-sm text-gray-500">Unavailable</p>}
            {order.shippingMethod && <p className="mt-2 text-sm text-gray-600">{order.shippingMethod.name}</p>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Totals</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{order.subtotal.formatted}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">Shipping</dt><dd>{order.shipping.formatted}</dd></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><dt>Total</dt><dd>{order.total.formatted}</dd></div>
            </dl>
          </div>
        </div>
      </Panel>

      <Panel title="Items">
        <Table headers={['Product', 'Qty', 'Unit', 'Line total']}>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td className="px-2 py-2">{i.name}</td>
              <td className="px-2 py-2">{i.quantity}</td>
              <td className="px-2 py-2">{i.unitPrice.formatted}</td>
              <td className="px-2 py-2">{i.lineTotal.formatted}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Status history">
        <ol className="space-y-2">
          {order.timeline.map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-brand-500" aria-hidden="true" />
              <span>
                <span className="font-medium text-gray-900">{e.status.replace(/_/g, ' ')}</span>
                {e.note && <span className="text-gray-600"> — {e.note}</span>}
                <span className="ml-2 text-xs text-gray-400">{new Date(e.at).toLocaleString('en-GB')}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
