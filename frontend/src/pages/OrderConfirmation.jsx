import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Clock, XCircle, Package, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import FormField from '../components/FormField';

const STATUS_UI = {
  pending_payment: { icon: Clock, tone: 'amber', label: 'Awaiting payment' },
  paid: { icon: CheckCircle2, tone: 'green', label: 'Payment successful' },
  payment_failed: { icon: XCircle, tone: 'red', label: 'Payment failed' },
  processing: { icon: Package, tone: 'blue', label: 'Preparing your order' },
  shipped: { icon: Truck, tone: 'blue', label: 'Shipped' },
  delivered: { icon: CheckCircle2, tone: 'green', label: 'Delivered' },
  cancelled: { icon: XCircle, tone: 'gray', label: 'Cancelled' },
  refunded: { icon: XCircle, tone: 'gray', label: 'Refunded' },
};

const TONES = {
  green: 'bg-green-50 text-green-800',
  amber: 'bg-amber-50 text-amber-900',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-brand-50 text-brand-900',
  gray: 'bg-gray-100 text-gray-700',
};

function estimatedDelivery(order) {
  if (!order.shippingMethod) return null;
  const base = new Date(order.placedAt);
  const [min, max] = order.shippingMethod.etaDays;
  const fmt = (days) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  return `${fmt(min)} – ${fmt(max)}`;
}

export default function OrderConfirmation() {
  const { reference } = useParams();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const justPaid = searchParams.get('paid') === '1';

  async function load(withEmail) {
    setLoading(true);
    setError('');
    try {
      const query = withEmail ? `?email=${encodeURIComponent(withEmail)}` : '';
      const data = await api(`/orders/${reference}${query}`);
      setOrder(data.order);
      setNeedsEmail(false);
    } catch (err) {
      if (err.status === 403) setNeedsEmail(true);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, reference]);

  // The payment is confirmed asynchronously through the message queue, so a
  // freshly paid order may still read "pending" for a second or two.
  useEffect(() => {
    if (!justPaid || !order || order.status !== 'pending_payment') return undefined;
    const timer = setTimeout(() => load(email || undefined), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPaid, order]);

  if (loading || authLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16" aria-busy="true">
        <p className="text-sm text-gray-500">Loading your order…</p>
      </main>
    );
  }

  if (needsEmail) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Helmet>
          <title>Find Your Order — Voltmarket</title>
          <meta name="robots" content="noindex, follow" />
        </Helmet>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Find order {reference}</h1>
        <p className="mb-6 text-sm text-gray-600">
          Enter the email address used when placing this order.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(email);
          }}
          noValidate
        >
          <FormField label="Email" type="email" value={email} onChange={setEmail} required />
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            View order
          </button>
        </form>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Helmet>
          <title>Order Not Found — Voltmarket</title>
          <meta name="robots" content="noindex, follow" />
        </Helmet>
        <h1 className="text-2xl font-bold text-gray-900">We could not find that order</h1>
        <p className="mt-2 text-sm text-gray-600">{error || 'Check the reference and try again.'}</p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to the shop
        </Link>
      </main>
    );
  }

  const ui = STATUS_UI[order.status] || STATUS_UI.pending_payment;
  const StatusIcon = ui.icon;
  const eta = estimatedDelivery(order);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Helmet>
        <title>{`Order ${order.reference} — Voltmarket`}</title>
        <meta
          name="description"
          content={`Track Voltmarket order ${order.reference}: current status, the items you bought, delivery address, shipping method and the total you paid.`}
        />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <div className={`mb-6 flex items-start gap-3 rounded-2xl p-5 ${TONES[ui.tone]}`}>
        <StatusIcon className="mt-0.5 h-6 w-6 flex-none" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-bold">
            {order.status === 'paid' ? 'Thank you — your order is confirmed' : ui.label}
          </h1>
          <p className="mt-1 text-sm">
            Order reference <strong>{order.reference}</strong>
            {order.status === 'pending_payment' && justPaid && ' · confirming your payment…'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Delivery
          </h2>
          {order.shippingAddress ? (
            <address className="text-sm not-italic text-gray-800">
              {order.shippingAddress.recipient}
              <br />
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
              <br />
              {order.shippingAddress.country}
            </address>
          ) : (
            <p className="text-sm text-gray-500">Address unavailable</p>
          )}
          {order.shippingMethod && (
            <p className="mt-3 text-sm text-gray-600">
              {order.shippingMethod.name}
              {eta && (
                <>
                  <br />
                  <span className="font-medium text-gray-900">Estimated delivery: {eta}</span>
                </>
              )}
            </p>
          )}
          {order.trackingNumber && (
            <p className="mt-2 text-sm">
              Tracking: <strong>{order.trackingNumber}</strong>
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Payment
          </h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="text-gray-900">{order.subtotal.formatted}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Shipping</dt>
              <dd className="text-gray-900">{order.shipping.formatted}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <dt className="font-semibold text-gray-900">Total</dt>
              <dd className="font-bold text-gray-900">{order.total.formatted}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Items
        </h2>
        <ul className="divide-y divide-gray-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-14 w-14 flex-none rounded-lg border border-gray-200 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.quantity} × {item.unitPrice.formatted}
                </p>
              </div>
              <p className="text-sm font-semibold text-gray-900">{item.lineTotal.formatted}</p>
            </li>
          ))}
        </ul>
      </section>

      {order.timeline.length > 0 && (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Status history
          </h2>
          <ol className="space-y-2">
            {order.timeline.map((event, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-brand-500" aria-hidden="true" />
                <span className="text-gray-900">
                  {(STATUS_UI[event.status] || {}).label || event.status}
                  {event.note && <span className="text-gray-500"> — {event.note}</span>}
                  <span className="ml-2 text-xs text-gray-600">
                    {new Date(event.at).toLocaleString('en-GB')}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Continue shopping
        </Link>
        {user && (
          <Link to="/account" className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            All my orders
          </Link>
        )}
      </div>
    </main>
  );
}
