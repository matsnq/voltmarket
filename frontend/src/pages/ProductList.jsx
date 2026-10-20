import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';

const SORTS = [
  ['relevance', 'Relevance'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Customer rating'],
  ['newest', 'Newest'],
];

// Category names range from "sedans" to "charging accessories", a 14-character
// spread that no single sentence can absorb while staying inside the 150-160
// character window search engines show. So pick the longest tail that still
// fits: short names get the fullest sentence, long names a tighter one.
const CATEGORY_TAILS = [
  ' Compare real-world range, battery size, price and owner ratings, then buy online with secure checkout and delivery across 16 EU countries.',
  ' Compare real-world range, battery size, price and owner ratings, then order online with secure checkout and fast EU delivery.',
  ' Compare range, battery, price and owner ratings, then order online with secure checkout and fast delivery across the EU.',
];

function categoryDescription(name) {
  const head = `Shop ${name} at Voltmarket.`;
  const tail = CATEGORY_TAILS.find((t) => (head + t).length <= 160) ?? CATEGORY_TAILS.at(-1);
  return (head + tail).slice(0, 160);
}

export default function ProductList() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const brands = (params.get('brand') || '').split(',').filter(Boolean);
  const sort = params.get('sort') || (q ? 'relevance' : 'newest');
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    api('/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) query.set(k, v);
    query.set('perPage', '12');

    api(`/products?${query}`)
      .then((d) => {
        if (!cancelled) setData(d);
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
  }, [params]);

  // Changing any filter resets to page 1 — staying on page 7 of a narrower
  // result set would show an empty page.
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' ) next.delete(key);
        else next.set(key, value);
      }
      if (!('page' in changes)) next.delete('page');
      setParams(next);
    },
    [params, setParams]
  );

  function toggleBrand(slug) {
    const next = brands.includes(slug) ? brands.filter((b) => b !== slug) : [...brands, slug];
    update({ brand: next.join(',') });
  }

  const activeFilters = [
    category && { key: 'category', label: category.replace(/-/g, ' ') },
    ...brands.map((b) => ({ key: `brand:${b}`, label: b })),
    params.get('minPrice') && { key: 'minPrice', label: `from €${params.get('minPrice')}` },
    params.get('maxPrice') && { key: 'maxPrice', label: `up to €${params.get('maxPrice')}` },
    params.get('minRating') && { key: 'minRating', label: `${params.get('minRating')}★ and up` },
    params.get('inStock') && { key: 'inStock', label: 'in stock' },
  ].filter(Boolean);

  function clearFilter(key) {
    if (key.startsWith('brand:')) return toggleBrand(key.slice(6));
    return update({ [key]: null });
  }

  const title = q ? `Search: ${q}` : category ? category.replace(/-/g, ' ') : 'All products';

  // A category page and a search page must not share one description —
  // duplicate meta across URLs is exactly what search engines discount.
  // Titles stay under 60 characters even for a long search query.
  const heading = title.charAt(0).toUpperCase() + title.slice(1);
  const pageTitle = `${heading} — Voltmarket`.slice(0, 60);
  const metaDescription = q
    ? `Search results for "${q}" at Voltmarket. Filter electric cars, home chargers and EV accessories by brand, price, range and rating, then buy online.`.slice(0, 160)
    : category
      ? categoryDescription(title)
      : 'Browse every electric car, home charger, cable and EV accessory at Voltmarket. Filter by brand, price, range and rating, with fast delivery across the EU.';

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
      </Helmet>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold capitalize text-gray-900">{title}</h1>
          {data && (
            <p className="mt-1 text-sm text-gray-600">
              {data.total} {data.total === 1 ? 'product' : 'products'}
              {q && <> matching “{q}”</>}
            </p>
          )}
        </div>

        {/* Wraps rather than overflowing: at 320px the sort control, the view
            toggle and the Filters button do not fit on one line. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="sort" className="text-sm text-gray-600">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="min-w-0 max-w-[9.5rem] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:max-w-none sm:flex-none"
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-gray-300" role="group" aria-label="View">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              className={`rounded-l-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-gray-500'}`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Grid view</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={`rounded-r-lg p-1.5 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-gray-500'}`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">List view</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm lg:hidden"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
          </button>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
          {activeFilters.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => clearFilter(f.key)}
                className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium capitalize text-brand-800 hover:bg-brand-100"
              >
                {f.label}
                <X className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">Remove filter</span>
              </button>
            </li>
          ))}
          <li>
            <Link to="/products" className="px-2 py-1 text-xs text-gray-500 underline">
              Clear all
            </Link>
          </li>
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`} aria-label="Filters">
          <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-4">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Category</h2>
              <ul className="space-y-1 text-sm">
                {categories.map((root) => (
                  <li key={root.id}>
                    <button
                      type="button"
                      onClick={() => update({ category: category === root.slug ? null : root.slug })}
                      className={`text-left hover:text-brand-700 ${category === root.slug ? 'font-semibold text-brand-700' : 'text-gray-700'}`}
                    >
                      {root.name} ({root.productCount})
                    </button>
                    <ul className="ml-3 mt-1 space-y-1">
                      {root.children.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            onClick={() =>
                              update({ category: category === child.slug ? null : child.slug })
                            }
                            className={`text-left text-xs hover:text-brand-700 ${category === child.slug ? 'font-semibold text-brand-700' : 'text-gray-600'}`}
                          >
                            {child.name} ({child.productCount})
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            {data && data.facets.brands.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-gray-900">Brand</h2>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                  {data.facets.brands.map((b) => (
                    <li key={b.slug}>
                      <label className="flex cursor-pointer items-center gap-2 text-gray-700">
                        <input
                          type="checkbox"
                          checked={brands.includes(b.slug)}
                          onChange={() => toggleBrand(b.slug)}
                          className="h-3.5 w-3.5 accent-brand-600"
                        />
                        {b.name}
                        <span className="text-xs text-gray-600">({b.count})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Price (€)</h2>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  update({ minPrice: f.get('minPrice'), maxPrice: f.get('maxPrice') });
                }}
              >
                <label className="sr-only" htmlFor="minPrice">Minimum price</label>
                <input
                  id="minPrice"
                  name="minPrice"
                  type="number"
                  min="0"
                  defaultValue={params.get('minPrice') || ''}
                  placeholder="min"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                />
                <label className="sr-only" htmlFor="maxPrice">Maximum price</label>
                <input
                  id="maxPrice"
                  name="maxPrice"
                  type="number"
                  min="0"
                  defaultValue={params.get('maxPrice') || ''}
                  placeholder="max"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white"
                >
                  Go
                </button>
              </form>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Rating</h2>
              <ul className="space-y-1 text-sm">
                {[4, 3].map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() =>
                        update({ minRating: params.get('minRating') === String(r) ? null : r })
                      }
                      className={`hover:text-brand-700 ${params.get('minRating') === String(r) ? 'font-semibold text-brand-700' : 'text-gray-700'}`}
                    >
                      {r}★ and up
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={params.get('inStock') === 'true'}
                  onChange={(e) => update({ inStock: e.target.checked ? 'true' : null })}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                In stock only
              </label>
            </section>
          </div>
        </aside>

        <section aria-labelledby="results-heading">
          {/* The product cards are h3. Without this h2 the document goes
              straight from the page h1 to h3 whenever the filter sidebar is
              collapsed — which is every phone-width viewport. */}
          <h2 id="results-heading" className="sr-only">
            {q ? `Search results for ${q}` : 'Products'}
            {data ? ` — ${data.total} found` : ''}
          </h2>
          {loading && <p className="text-sm text-gray-500">Loading products…</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {data && data.items.length === 0 && !loading && (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <p className="font-medium text-gray-900">No products match those filters</p>
              <p className="mt-1 text-sm text-gray-600">Try removing a filter or widening the price range.</p>
              <Link to="/products" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
                Clear all filters
              </Link>
            </div>
          )}

          {data && data.items.length > 0 && (
            <ul
              className={
                view === 'grid'
                  ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
                  : 'flex flex-col gap-3'
              }
            >
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} view={view} />
              ))}
            </ul>
          )}

          {data && data.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => update({ page: page - 1 })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => update({ page: page + 1 })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
