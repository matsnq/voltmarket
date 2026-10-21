import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Zap, Truck, ShieldCheck, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    // Both failures used to be swallowed, so an unreachable API rendered a
    // hero and a footer with nothing between them — a page that looks
    // finished and empty rather than broken. Now it says so.
    Promise.all([
      api('/products/popular?limit=12'),
      api('/categories'),
    ])
      .then(([p, c]) => {
        if (!active) return;
        setFeatured(p.items);
        setCategories(c.categories);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <main>
      <Helmet>
        <title>Voltmarket — Electric Cars &amp; EV Gear Online</title>
        <meta
          name="description"
          content="Buy electric cars, home chargers and EV accessories at Voltmarket. Compare real-world range, battery size and price, with secure checkout and EU delivery."
        />
      </Helmet>

      <section className="border-b border-gray-200 bg-gradient-to-br from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <Zap className="mx-auto mb-4 h-12 w-12 text-brand-600" aria-hidden="true" />
          <h1 className="text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
            Drive electric, buy it online
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            New electric cars, home charging and everything in between — compared on range,
            battery and price, delivered to your door.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/products?category=electric-cars"
              className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Browse electric cars
            </Link>
            <Link
              to="/products?category=charging-accessories"
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Chargers &amp; accessories
            </Link>
          </div>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-4 text-sm sm:grid-cols-3">
            <li className="flex items-center justify-center gap-2 text-gray-600">
              <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Delivery across 16 countries
            </li>
            <li className="flex items-center justify-center gap-2 text-gray-600">
              <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Secure card payment
            </li>
            <li className="flex items-center justify-center gap-2 text-gray-600">
              <Zap className="h-4 w-4 text-brand-600" aria-hidden="true" />
              EU manufacturer warranty
            </li>
          </ul>
        </div>
      </section>

      {categories.length > 0 && (
        <section aria-labelledby="cat-heading" className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="cat-heading" className="mb-6 text-xl font-bold text-gray-900">
            Shop by category
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.flatMap((root) =>
              root.children.map((child) => (
                <li key={child.id}>
                  <Link
                    to={`/products?category=${child.slug}`}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">
                        {child.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {child.productCount} products
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-4 pb-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="featured-heading" className="text-xl font-bold text-gray-900">
                Most popular right now
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                What people are buying and rating across cars, charging and accessories.
              </p>
            </div>
            <Link to="/products" className="text-sm font-medium text-brand-700 hover:underline">
              See all products →
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ul>
        </section>
      )}

      {loading && !failed && (
        <section className="mx-auto max-w-6xl px-4 pb-16" aria-busy="true">
          <p className="text-sm text-gray-500">Loading the shop…</p>
        </section>
      )}

      {failed && (
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h2 className="text-lg font-semibold text-amber-900">
              The catalogue is not responding
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-amber-800">
              Products could not be loaded, so this page is showing less than it should. The
              API may still be starting up.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
            >
              Try again
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
