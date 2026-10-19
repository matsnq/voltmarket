import { Link } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';

// Left panel of the checkout: a live summary that updates as the shopper
// changes quantities or picks a different shipping method.
export default function OrderSummary({ cart, shippingMethod, onUpdateQty, onRemove, busy }) {
  const shippingCents = shippingMethod ? shippingMethod.price.cents : 0;
  const totalCents = cart.subtotal.cents + shippingCents;

  const fmt = (cents) =>
    new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

  return (
    <div className="lg:sticky lg:top-20">
      <Link
        to="/cart"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to cart
      </Link>

      <section
        aria-labelledby="summary-heading"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 id="summary-heading" className="mb-4 text-base font-semibold text-gray-900">
          Order summary
        </h2>

        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 rounded-xl bg-gray-50 p-3"
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.imageAlt || item.name}
                  className="h-16 w-16 flex-none rounded-lg border border-gray-200 bg-white object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 flex-none items-center justify-center rounded-lg border border-gray-200 bg-white">
                  <Package className="h-6 w-6 text-gray-400" aria-hidden="true" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="flex-none text-sm font-semibold text-gray-900">
                    {item.lineTotal.formatted}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{item.unitPrice.formatted} each</p>

                <div className="mt-2 flex items-center gap-2">
                  <label className="sr-only" htmlFor={`qty-${item.id}`}>
                    Quantity for {item.name}
                  </label>
                  <select
                    id={`qty-${item.id}`}
                    value={item.quantity}
                    disabled={busy}
                    onChange={(e) => onUpdateQty(item.id, Number(e.target.value))}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {Array.from(
                      { length: Math.max(1, Math.min(item.stockQuantity, 20)) },
                      (_, i) => i + 1
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={busy}
                    className="text-xs font-medium text-gray-500 underline transition hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>

                {item.exceedsStock && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    Only {item.stockQuantity} left — reduce the quantity to continue.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-2 border-t border-gray-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Subtotal</dt>
            <dd className="font-medium text-gray-900">{cart.subtotal.formatted}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">
              Shipping
              {shippingMethod && (
                <span className="ml-1 text-xs text-gray-600">({shippingMethod.name})</span>
              )}
            </dt>
            <dd className="font-medium text-gray-900">
              {shippingMethod ? fmt(shippingCents) : '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
            <dt className="text-base font-semibold text-gray-900">Total</dt>
            <dd className="text-xl font-bold text-gray-900">{fmt(totalCents)}</dd>
          </div>
          <p className="pt-1 text-xs text-gray-500">VAT included where applicable.</p>
        </dl>
      </section>
    </div>
  );
}
