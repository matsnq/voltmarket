import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Table, Pagination, Banner, Pill, btn } from '../../components/admin/ui';
import FormField from '../../components/FormField';

const EMPTY = {
  name: '', description: '', priceCents: '', stockQuantity: '',
  categoryId: '', brandId: '', weightKg: '', lengthMm: '', widthMm: '',
  heightMm: '', rangeKm: '', batteryKwh: '', motorPowerKw: '', isActive: true,
};

function ProductForm({ initial, categories, brands, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial.id);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: null }));
  };

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!form.name || form.name.trim().length < 2) next.name = 'Name is required';
    if (!form.description || form.description.trim().length < 10) next.description = 'At least 10 characters';
    if (form.priceCents === '' || Number(form.priceCents) < 0) next.priceCents = 'Enter a price';
    if (form.stockQuantity === '' || Number(form.stockQuantity) < 0) next.stockQuantity = 'Enter a stock level';
    if (!form.categoryId) next.categoryId = 'Choose a category';
    if (!form.brandId) next.brandId = 'Choose a brand';
    setErrors(next);
    if (Object.keys(next).length) return;

    // Only send fields that carry a value; the API treats undefined as
    // "leave alone", which is what an empty optional field should mean.
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      priceCents: Math.round(Number(form.priceCents)),
      stockQuantity: Math.round(Number(form.stockQuantity)),
      categoryId: Number(form.categoryId),
      brandId: Number(form.brandId),
      isActive: Boolean(form.isActive),
    };
    for (const k of ['weightKg', 'lengthMm', 'widthMm', 'heightMm', 'rangeKm', 'batteryKwh', 'motorPowerKw']) {
      if (form[k] !== '' && form[k] !== null && form[k] !== undefined) payload[k] = Number(form[k]);
    }

    setSaving(true);
    setBanner('');
    try {
      if (editing) await api(`/admin/products/${initial.id}`, { method: 'PATCH', body: payload });
      else await api('/admin/products', { method: 'POST', body: payload });
      onSaved();
    } catch (err) {
      const fieldErrors = {};
      for (const d of err.details || []) fieldErrors[d.field] = d.message;
      setErrors((e) => ({ ...e, ...fieldErrors }));
      setBanner(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title={editing ? `Edit ${initial.name}` : 'New product'}>
      <Banner onDismiss={() => setBanner('')}>{banner}</Banner>
      <form onSubmit={submit} noValidate>
        <FormField label="Name" value={form.name} onChange={set('name')} error={errors.name} required />

        <div className="mb-4">
          <label htmlFor="p-desc" className="mb-1 block text-sm font-medium text-gray-700">
            Description <span className="text-red-600">*</span>
          </label>
          <textarea
            id="p-desc"
            rows={3}
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            aria-invalid={errors.description ? 'true' : undefined}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              errors.description ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
            }`}
          />
          {errors.description && <p role="alert" className="mt-1 text-xs text-red-600">{errors.description}</p>}
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField
            label="Price (cents)" type="number" value={form.priceCents}
            onChange={set('priceCents')} error={errors.priceCents}
            hint={form.priceCents ? `= €${(Number(form.priceCents) / 100).toFixed(2)}` : 'e.g. 64900 = €649.00'}
            required
          />
          <FormField label="Stock" type="number" value={form.stockQuantity} onChange={set('stockQuantity')} error={errors.stockQuantity} required />
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-cat" className="mb-1 block text-sm font-medium text-gray-700">
              Category <span className="text-red-600">*</span>
            </label>
            <select
              id="p-cat" value={form.categoryId} onChange={(e) => set('categoryId')(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Choose…</option>
              {categories.filter((c) => c.parentId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.categoryId && <p role="alert" className="mt-1 text-xs text-red-600">{errors.categoryId}</p>}
          </div>
          <div>
            <label htmlFor="p-brand" className="mb-1 block text-sm font-medium text-gray-700">
              Brand <span className="text-red-600">*</span>
            </label>
            <select
              id="p-brand" value={form.brandId} onChange={(e) => set('brandId')(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Choose…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {errors.brandId && <p role="alert" className="mt-1 text-xs text-red-600">{errors.brandId}</p>}
          </div>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-gray-700">
            Dimensions and EV specification (optional)
          </legend>
          <p className="mb-2 text-xs text-gray-500">
            Enter metric values only — imperial is derived by the database and cannot drift.
          </p>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <FormField label="Weight (kg)" type="number" value={form.weightKg} onChange={set('weightKg')} />
            <FormField label="Length (mm)" type="number" value={form.lengthMm} onChange={set('lengthMm')} />
            <FormField label="Width (mm)" type="number" value={form.widthMm} onChange={set('widthMm')} />
            <FormField label="Height (mm)" type="number" value={form.heightMm} onChange={set('heightMm')} />
            <FormField label="Range (km)" type="number" value={form.rangeKm} onChange={set('rangeKm')} />
            <FormField label="Battery (kWh)" type="number" value={form.batteryKwh} onChange={set('batteryKwh')} />
          </div>
        </fieldset>

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => set('isActive')(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Visible in the shop
        </label>

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={btn.primary}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </button>
          <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
        </div>
      </form>
    </Panel>
  );
}

export default function AdminProducts() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [editing, setEditing] = useState(null);
  const [banner, setBanner] = useState('');
  const [query, setQuery] = useState(params.get('q') || '');

  const canEdit = ['admin', 'sales'].includes(user.role);
  const canDelete = user.role === 'admin';
  const page = Number(params.get('page') || 1);
  const status = params.get('status') || '';

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) qs.set(k, v);
    try {
      setData(await api(`/admin/products?${qs}`));
    } catch (err) {
      setBanner(err.message);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/admin/categories').then((d) => setCategories(d.categories)).catch(() => {});
    api('/brands').then((d) => setBrands(d.brands)).catch(() => {});
  }, []);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  async function remove(product) {
    if (!window.confirm(`Delete "${product.name}"? Products referenced by past orders are hidden instead of deleted.`)) return;
    try {
      const res = await api(`/admin/products/${product.id}`, { method: 'DELETE' });
      setBanner(res.deactivated ? res.reason : `"${product.name}" deleted.`);
      await load();
    } catch (err) {
      setBanner(err.message);
    }
  }

  if (editing) {
    return (
      <ProductForm
        initial={editing}
        categories={categories}
        brands={brands}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); setBanner('Saved.'); await load(); }}
      />
    );
  }

  return (
    <div>
      <Helmet><title>Products — Voltmarket Admin</title></Helmet>
      <Banner tone={banner.includes('delet') || banner.includes('Saved') ? 'green' : 'red'} onDismiss={() => setBanner('')}>
        {banner}
      </Banner>

      <Panel
        title={data ? `${data.total} products` : 'Products'}
        action={
          canEdit && (
            <div className="flex gap-2">
              <Link to="/admin/products/import" className={btn.secondary}>Bulk import</Link>
              <button type="button" onClick={() => setEditing({ ...EMPTY })} className={`${btn.primary} flex items-center gap-1`}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New product
              </button>
            </div>
          )
        }
      >
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); update({ q: query }); }}
          role="search"
        >
          <div className="relative min-w-[200px] flex-1">
            <label htmlFor="admin-product-search" className="sr-only">Search products</label>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="admin-product-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <label className="sr-only" htmlFor="admin-product-status">Filter by status</label>
          <select
            id="admin-product-status"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="active">Visible</option>
            <option value="inactive">Hidden</option>
            <option value="low">Low stock</option>
          </select>
          <button type="submit" className={btn.secondary}>Search</button>
        </form>

        {data && (
          <>
            <Table
              headers={['Product', 'Category', 'Price', 'Stock', 'Rating', '']}
              empty={data.products.length === 0 ? 'No products match those filters.' : null}
            >
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {p.image && <img src={p.image} alt="" className="h-9 w-9 flex-none rounded border border-gray-200 object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.brandName}</p>
                      </div>
                      {!p.isActive && <Pill tone="gray">hidden</Pill>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-gray-600">{p.categoryName}</td>
                  <td className="whitespace-nowrap px-2 py-2">{p.price.formatted}</td>
                  <td className="px-2 py-2">
                    {p.stockQuantity <= 3
                      ? <Pill tone={p.stockQuantity === 0 ? 'red' : 'amber'}>{p.stockQuantity}</Pill>
                      : p.stockQuantity}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-gray-600">
                    {p.rating.count ? `${p.rating.average.toFixed(1)} (${p.rating.count})` : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditing({
                            id: p.id, name: p.name, description: p.description,
                            priceCents: p.priceCents, stockQuantity: p.stockQuantity,
                            categoryId: p.categoryId, brandId: p.brandId,
                            weightKg: p.weightKg ?? '', lengthMm: p.lengthMm ?? '',
                            widthMm: p.widthMm ?? '', heightMm: p.heightMm ?? '',
                            rangeKm: p.rangeKm ?? '', batteryKwh: p.batteryKwh ?? '',
                            motorPowerKw: p.motorPowerKw ?? '', isActive: p.isActive,
                          })}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-700"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => remove(p)}
                          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
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
