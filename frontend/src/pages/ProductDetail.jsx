import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Package, Check, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { useCart } from '../hooks/useCart';
import ProductCard from '../components/ProductCard';
import ProductReviews from '../components/reviews/ProductReviews';
import Stars from '../components/reviews/Stars';

function Spec({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex justify-between border-b border-gray-100 py-2 text-sm last:border-0">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('idle');
  const [rating, setRating] = useState({ average: 0, count: 0 });
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProduct(null);
    api(`/products/${slug}`)
      .then((d) => {
        if (!cancelled) {
          setProduct(d.product);
          setRating(d.product.rating);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onAdd() {
    setState('adding');
    setMessage('');
    const res = await addItem(product.id, quantity);
    if (res.ok) {
      setState('added');
      setTimeout(() => setState('idle'), 2000);
    } else {
      setState('error');
      setMessage(res.error);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16" aria-busy="true">
        <p className="text-sm text-gray-500">Loading product…</p>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <Helmet>
          <title>Product Not Found — Voltmarket</title>
        </Helmet>
        <h1 className="text-2xl font-bold text-gray-900">Product not found</h1>
        <p className="mt-2 text-sm text-gray-600">{error || 'It may have been removed.'}</p>
        <Link to="/products" className="mt-6 inline-block text-sm font-medium text-brand-700 underline">
          Browse all products
        </Link>
      </main>
    );
  }

  const image = product.images && product.images[0];
  const d = product.dimensions;

  // Meta description kept near 155 characters, per the SEO requirement.
  const metaDescription = `${product.name} from ${product.brand.name}. ${
    product.ev ? `${product.ev.rangeKm} km range, ${product.ev.batteryKwh} kWh battery. ` : ''
  }${product.price.formatted} at Voltmarket.`.slice(0, 157);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Helmet>
        <title>{`${product.name} — Voltmarket`}</title>
        <meta name="description" content={metaDescription} />
      </Helmet>

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link to="/" className="hover:text-brand-700">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link to="/products" className="hover:text-brand-700">Products</Link></li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              to={`/products?category=${product.category.slug}`}
              className="hover:text-brand-700"
            >
              {product.category.name}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          {image ? (
            <img
              src={image.url}
              alt={image.alt || product.name}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 object-cover"
            />
          ) : (
            <div className="flex h-72 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
              <Package className="h-12 w-12 text-gray-400" aria-hidden="true" />
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
            {product.brand.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{product.name}</h1>

          <div className="mt-2 flex items-center gap-2">
            <Stars value={rating.average} size="md" count={rating.count} />
            <a href="#reviews-heading" className="text-sm text-brand-700 hover:underline">
              {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
            </a>
          </div>

          <p className="mt-4 text-3xl font-bold text-gray-900">{product.price.formatted}</p>
          <p className={`mt-1 text-sm ${product.inStock ? 'text-green-700' : 'text-red-600'}`}>
            {product.inStock
              ? `In stock — ${product.stockQuantity} available`
              : 'Currently out of stock'}
          </p>

          <p className="mt-4 text-sm leading-relaxed text-gray-700">{product.description}</p>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="qty" className="mb-1 block text-sm font-medium text-gray-700">
                Quantity
              </label>
              <select
                id="qty"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!product.inStock}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {Array.from(
                  { length: Math.max(1, Math.min(product.stockQuantity, 20)) },
                  (_, i) => i + 1
                ).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={!product.inStock || state === 'adding'}
              className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${
                state === 'added' ? 'bg-green-600' : 'bg-gray-900 hover:bg-gray-800'
              } disabled:cursor-not-allowed disabled:bg-gray-300`}
            >
              {!product.inStock
                ? 'Out of stock'
                : state === 'adding'
                  ? 'Adding…'
                  : state === 'added'
                    ? 'Added to cart ✓'
                    : 'Add to cart'}
            </button>
          </div>

          {state === 'added' && (
            <p role="status" className="mt-3 text-sm">
              <Link to="/cart" className="font-medium text-brand-700 underline">
                Go to cart →
              </Link>
            </p>
          )}
          {state === 'error' && (
            <p role="alert" className="mt-3 text-sm text-red-600">{message}</p>
          )}

          <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <Truck className="h-4 w-4" aria-hidden="true" />
            Delivery options and costs are shown at checkout.
          </p>
        </div>
      </div>

      <section aria-labelledby="specs-heading" className="mt-10">
        <h2 id="specs-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Specifications
        </h2>
        <dl className="rounded-2xl border border-gray-200 bg-white px-5 py-2 sm:columns-2 sm:gap-8">
          <Spec label="Brand" value={product.brand.name} />
          <Spec label="Category" value={product.category.name} />
          {product.ev && <Spec label="Range (WLTP)" value={`${product.ev.rangeKm} km`} />}
          {product.ev && product.ev.batteryKwh && (
            <Spec label="Battery" value={`${product.ev.batteryKwh} kWh`} />
          )}
          {product.ev && product.ev.motorPowerKw && (
            <Spec label="Power" value={`${product.ev.motorPowerKw} kW`} />
          )}
          {product.weight && (
            <Spec label="Weight" value={`${product.weight.kg} kg / ${product.weight.lb} lb`} />
          )}
          {d && (
            <Spec
              label="Length"
              value={`${d.metric.lengthMm} mm / ${d.imperial.lengthIn} in`}
            />
          )}
          {d && (
            <Spec label="Width" value={`${d.metric.widthMm} mm / ${d.imperial.widthIn} in`} />
          )}
          {d && (
            <Spec label="Height" value={`${d.metric.heightMm} mm / ${d.imperial.heightIn} in`} />
          )}
          {Object.entries(product.attributes || {}).map(([k, v]) => (
            <Spec key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={String(v)} />
          ))}
        </dl>
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Imperial figures are derived from the metric values by the database, so they can
          never disagree.
        </p>
      </section>

      <ProductReviews slug={slug} onRatingChange={setRating} />

      {product.related && product.related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="mb-4 text-lg font-semibold text-gray-900">
            Related products
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
