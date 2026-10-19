import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';

const STATUS_TONES = {
  pending_payment: 'bg-amber-50 text-amber-900',
  paid: 'bg-green-50 text-green-800',
  payment_failed: 'bg-red-50 text-red-700',
  processing: 'bg-brand-50 text-brand-800',
  shipped: 'bg-brand-50 text-brand-800',
  delivered: 'bg-green-50 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
  refunded: 'bg-gray-100 text-gray-700',
};

const FILTERS = [
  ['', 'All orders'],
  ['pending_payment', 'Awaiting payment'],
  ['paid', 'Paid'],
  ['processing', 'Processing'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function OrderHistory() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const qs = new URLSearchParams({ page: String(page) });
    if (status) qs.set('status', status);
    try {
      setData(await api(`/orders?${qs}`));
    } catch (err) {
      setError(err.message);
    }
  }, [page, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="mb-4 text-lg font-semibold text-gray-900">
        Order history
      </h2>

      <div className="mb-4">
        <label htmlFor="order-status" className="mb-1 block text-sm font-medium text-gray-700">
          Filter by status
        </label>
        <select
          id="order-status"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {FILTERS.map(([value, label]) => (
            <option key={value || 'all'} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {data === null && !error && <p className="text-sm text-gray-500">Loading your orders…</p>}

      {data?.orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900">
            {status ? 'No orders with that status' : 'You have not placed an order yet'}
          </p>
          {!status && (
            <Link to="/products" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
              Start shopping
            </Link>
          )}
        </div>
      )}

      {data && data.orders.length > 0 && (
        <>
          <p className="mb-3 text-sm text-gray-600">
            {data.total} order{data.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {data.orders.map((order) => (
              <li key={order.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <Link
                  to={`/orders/${order.reference}`}
                  className="block rounded-xl p-4 transition hover:border-brand-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {order.reference}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_TONES[order.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                      {order.total.formatted}
                      <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">
                    Placed {formatDate(order.placedAt)} ·{' '}
                    {order.items.length} item{order.items.length === 1 ? '' : 's'}
                    {order.trackingNumber && <> · tracking {order.trackingNumber}</>}
                  </p>

                  <ul className="mt-3 flex flex-wrap gap-2">
                    {order.items.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400">
                            {item.quantity}×
                          </span>
                        )}
                      </li>
                    ))}
                    {order.items.length > 4 && (
                      <li className="flex h-12 items-center text-xs text-gray-500">
                        +{order.items.length - 4} more
                      </li>
                    )}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>

          {data.totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Order history pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {page} of {data.totalPages}</span>
              <button
                type="button"
                disabled={page >= data.totalPages}
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
