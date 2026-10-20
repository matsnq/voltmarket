import { Link } from 'react-router-dom';
import { Package, Star, BatteryCharging, Gauge } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useState } from 'react';

function Rating({ value, count }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span
      className="flex items-center gap-1 text-xs text-gray-600"
      aria-label={`Rated ${value} out of 5 from ${count} reviews`}
    >
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-3.5 w-3.5 ${
              n <= rounded ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
            }`}
          />
        ))}
      </span>
      {value.toFixed(1)} ({count})
    </span>
  );
}

export default function ProductCard({ product, view = 'grid' }) {
  const { addItem } = useCart();
  const [state, setState] = useState('idle'); // idle | adding | added | error
  const [message, setMessage] = useState('');

  async function onAdd(e) {
    e.preventDefault();
    e.stopPropagation();
    setState('adding');
    const res = await addItem(product.id, 1);
    if (res.ok) {
      setState('added');
      setTimeout(() => setState('idle'), 1800);
    } else {
      setState('error');
      setMessage(res.error);
    }
  }

  const image = product.images && product.images[0];
  const outOfStock = !product.inStock;
  const isList = view === 'list';

  return (
    <li
      className={`group relative rounded-2xl border border-gray-200 bg-white transition hover:border-brand-300 hover:shadow-md ${
        isList ? 'flex gap-4 p-4' : 'flex flex-col p-3'
      }`}
    >
      <Link
        to={`/products/${product.slug}`}
        className={isList ? 'flex-none' : 'block'}
        aria-label={product.name}
      >
        {image ? (
          <img
            src={image.thumbUrl || image.url}
            srcSet={
              image.thumbUrl && image.thumbWidth
                ? `${image.thumbUrl} ${image.thumbWidth}w, ${image.url} ${image.width}w`
                : undefined
            }
            sizes={isList ? '160px' : '(min-width: 1280px) 320px, (min-width: 640px) 45vw, 90vw'}
            width={image.thumbWidth || undefined}
            height={image.thumbHeight || undefined}
            alt={image.alt || product.name}
            loading="lazy"
            className={`rounded-xl bg-gray-50 object-cover ${
              isList ? 'h-28 w-40' : 'h-40 w-full'
            }`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-xl bg-gray-50 ${
              isList ? 'h-28 w-40' : 'h-40 w-full'
            }`}
          >
            <Package className="h-8 w-8 text-gray-400" aria-hidden="true" />
          </div>
        )}
      </Link>

      <div className={`flex min-w-0 flex-1 flex-col ${isList ? '' : 'mt-3'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
          {product.brand.name}
        </p>
        <h3 className="mt-0.5 text-sm font-semibold leading-snug text-gray-900">
          <Link to={`/products/${product.slug}`} className="hover:text-brand-700">
            {/* Stretched link makes the whole card clickable without nesting
                interactive elements, which would break keyboard navigation. */}
            {product.name}
          </Link>
        </h3>

        <div className="mt-1">
          <Rating value={product.rating.average} count={product.rating.count} />
        </div>

        {product.ev && (
          <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
              <dt className="sr-only">Range</dt>
              <dd>{product.ev.rangeKm} km</dd>
            </div>
            {product.ev.batteryKwh && (
              <div className="flex items-center gap-1">
                <BatteryCharging className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <dt className="sr-only">Battery</dt>
                <dd>{product.ev.batteryKwh} kWh</dd>
              </div>
            )}
          </dl>
        )}

        {isList && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600">{product.description}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="text-base font-bold text-gray-900">{product.price.formatted}</p>
            <p className={`text-xs ${outOfStock ? 'text-red-600' : 'text-green-700'}`}>
              {outOfStock
                ? 'Out of stock'
                : product.stockQuantity <= 3
                  ? `Only ${product.stockQuantity} left`
                  : 'In stock'}
            </p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={outOfStock || state === 'adding'}
            className={`relative z-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              state === 'added'
                ? 'bg-green-600 text-white'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            } disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500`}
          >
            {outOfStock
              ? 'Unavailable'
              : state === 'adding'
                ? 'Adding…'
                : state === 'added'
                  ? 'Added ✓'
                  : 'Add to cart'}
          </button>
        </div>

        {state === 'error' && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {message}
          </p>
        )}
      </div>
    </li>
  );
}
