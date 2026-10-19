import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Zap, Truck, ShieldCheck, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api('/products?sort=rating&perPage=8').then((d) => setFeatured(d.items)).catch(() => {});
    api('/categories').then((d) => setCategories(d.categories)).catch(() => {});
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
          <div className="mb-6 flex items-end justify-between">
            <h2 id="featured-heading" className="text-xl font-bold text-gray-900">
              Top rated
            </h2>
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
    </main>
  );
}
