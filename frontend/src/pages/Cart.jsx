import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Package, Trash2 } from 'lucide-react';
import { useCart } from '../hooks/useCart';

export default function Cart() {
  const { cart, loading, error, updateItem, removeItem, addItem } = useCart();

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16" aria-busy="true">
        <p className="text-sm text-gray-500">Loading your cart…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Helmet>
        <title>Your Shopping Cart — Voltmarket</title>
        <meta
          name="description"
          content="Review the electric cars and EV accessories in your Voltmarket cart before checking out."
        />
      </Helmet>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-900">
        <ShoppingCart className="h-6 w-6 text-brand-600" aria-hidden="true" />
        Your cart
      </h1>

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cart.items.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-lg font-medium text-gray-900">Your cart is empty</p>
          <p className="mt-1 text-sm text-gray-600">
            Browse electric cars, chargers and accessories to get started.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-labelledby="items-heading">
            <h2 id="items-heading" className="sr-only">
              Items in your cart
            </h2>
            <ul className="space-y-3">
              {cart.items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.imageAlt || item.name}
                      className="h-24 w-24 flex-none rounded-xl border border-gray-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 flex-none items-center justify-center rounded-xl border border-gray-200">
                      <Package className="h-8 w-8 text-gray-400" aria-hidden="true" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/products/${item.slug}`}
                          className="block truncate font-medium text-gray-900 hover:text-brand-700"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {item.unitPrice.formatted} each
                        </p>
                      </div>
                      <p className="flex-none text-base font-semibold text-gray-900">
                        {item.lineTotal.formatted}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <label htmlFor={`qty-${item.id}`} className="text-sm text-gray-600">
                        Qty
                      </label>
                      <select
                        id={`qty-${item.id}`}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, Number(e.target.value))}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
                        onClick={() => removeItem(item.id)}
                        className="flex items-center gap-1 text-sm text-gray-500 transition hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    </div>

                    {item.exceedsStock && (
                      <p role="alert" className="mt-2 text-sm text-red-600">
                        Only {item.stockQuantity} left in stock.
                      </p>
                    )}
                    {item.unavailable && (
                      <p role="alert" className="mt-2 text-sm text-red-600">
                        This item is currently unavailable.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">
                    Items ({cart.itemCount})
                  </dt>
                  <dd className="font-medium text-gray-900">{cart.subtotal.formatted}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Shipping</dt>
                  <dd className="text-gray-500">Calculated at checkout</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
                  <dt className="text-base font-semibold text-gray-900">Total</dt>
                  <dd className="text-xl font-bold text-gray-900">{cart.subtotal.formatted}</dd>
                </div>
              </dl>
              <Link
                to="/checkout"
                className="mt-5 block rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Proceed to checkout
              </Link>
            </div>
          </aside>
        </div>
      )}

      {cart.related && cart.related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="mb-4 text-lg font-semibold text-gray-900">
            You might also like
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cart.related.map((p) => (
              <li key={p.id} className="rounded-2xl border border-gray-200 bg-white p-3">
                {p.image && (
                  <img
                    src={p.image}
                    alt={p.imageAlt || p.name}
                    className="mb-2 h-28 w-full rounded-lg object-cover"
                  />
                )}
                <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-sm text-gray-600">{p.price.formatted}</p>
                <button
                  type="button"
                  onClick={() => addItem(p.id, 1)}
                  className="mt-2 w-full rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Add to cart
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
