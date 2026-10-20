import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Table, Banner, Pill, btn } from '../../components/admin/ui';

const EMPTY = {
  name: '',
  description: '',
  priceCents: 0,
  etaDaysMin: 1,
  etaDaysMax: 3,
  sortOrder: 0,
  isActive: true,
};

// Operators think in euros; the API speaks integer cents.
const toEuros = (cents) => (cents / 100).toFixed(2);
const toCents = (euros) => Math.round(Number(euros) * 100);

export default function Shipping() {
  const { user } = useAuth();
  const [methods, setMethods] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | method
  const [form, setForm] = useState(EMPTY);
  const [priceEuros, setPriceEuros] = useState('0.00');
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/admin/shipping-methods');
      setMethods(data.shippingMethods);
    } catch (e) { setBanner(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(method) {
    setBanner('');
    setEditing(method || 'new');
    setForm(method
      ? {
          name: method.name,
          description: method.description || '',
          priceCents: method.priceCents,
          etaDaysMin: method.etaDaysMin,
          etaDaysMax: method.etaDaysMax,
          sortOrder: method.sortOrder,
          isActive: method.isActive,
        }
      : EMPTY);
    setPriceEuros(toEuros(method ? method.priceCents : 0));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setBanner('');
    const body = {
      name: form.name,
      description: form.description || null,
      priceCents: toCents(priceEuros),
      etaDaysMin: Number(form.etaDaysMin),
      etaDaysMax: Number(form.etaDaysMax),
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (editing === 'new') await api('/admin/shipping-methods', { method: 'POST', body });
      else await api(`/admin/shipping-methods/${editing.id}`, { method: 'PATCH', body });
      setBanner(`Delivery option ${editing === 'new' ? 'created' : 'updated'}.`);
      setEditing(null);
      await load();
    } catch (e2) { setBanner(e2.message); } finally { setSaving(false); }
  }

  async function toggleActive(m) {
    setBanner('');
    try {
      await api(`/admin/shipping-methods/${m.id}`, {
        method: 'PATCH',
        body: { isActive: !m.isActive },
      });
      setBanner(`"${m.name}" is now ${m.isActive ? 'hidden from' : 'offered at'} checkout.`);
      await load();
    } catch (e) { setBanner(e.message); }
  }

  async function remove(m) {
    const warning = m.orderCount > 0
      ? `${m.orderCount} order(s) used "${m.name}". It will be hidden from checkout rather than deleted, so those orders keep their delivery details. Continue?`
      : `Delete "${m.name}"? No order has used it, so it will be removed completely.`;
    if (!window.confirm(warning)) return;
    setBanner('');
    try {
      const res = await api(`/admin/shipping-methods/${m.id}`, { method: 'DELETE' });
      setBanner(res.deleted
        ? `"${m.name}" deleted.`
        : `"${m.name}" is referenced by ${res.orderCount} order(s), so it was hidden from checkout instead of deleted.`);
      await load();
    } catch (e) { setBanner(e.message); }
  }

  const activeCount = (methods || []).filter((m) => m.isActive).length;

  return (
    <div>
      <Helmet><title>Delivery Options — Voltmarket Admin</title></Helmet>
      <Banner
        tone={/created|updated|deleted|now offered|now hidden|hidden from checkout/.test(banner) ? 'green' : 'red'}
        onDismiss={() => setBanner('')}
      >
        {banner}
      </Banner>

      {editing && (
        <form onSubmit={save} className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {editing === 'new' ? 'New delivery option' : `Edit ${editing.name}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sm-name" className="mb-1 block text-sm font-medium text-gray-700">
                Name <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input id="sm-name" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="sm-price" className="mb-1 block text-sm font-medium text-gray-700">
                Price (€) <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input id="sm-price" type="number" min="0" step="0.01" required value={priceEuros}
                onChange={(e) => setPriceEuros(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-500">0.00 is allowed — free collection, for example.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="sm-desc" className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea id="sm-desc" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-500">Shown under the option at checkout.</p>
            </div>
            <div>
              <label htmlFor="sm-min" className="mb-1 block text-sm font-medium text-gray-700">
                Earliest delivery (days)
              </label>
              <input id="sm-min" type="number" min="0" max="365" value={form.etaDaysMin}
                onChange={(e) => setForm({ ...form, etaDaysMin: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="sm-max" className="mb-1 block text-sm font-medium text-gray-700">
                Latest delivery (days)
              </label>
              <input id="sm-max" type="number" min="0" max="365" value={form.etaDaysMax}
                onChange={(e) => setForm({ ...form, etaDaysMax: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="sm-sort" className="mb-1 block text-sm font-medium text-gray-700">
                Sort order
              </label>
              <input id="sm-sort" type="number" min="0" max="999" value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-500">Lower numbers appear first at checkout.</p>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 accent-brand-600" />
                Offered at checkout
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className={btn.primary}>
              {saving ? 'Saving…' : 'Save delivery option'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={btn.secondary}>Cancel</button>
          </div>
        </form>
      )}

      <Panel
        title={methods ? `${methods.length} delivery options · ${activeCount} offered at checkout` : 'Delivery options'}
        action={
          <button type="button" onClick={() => open(null)} className={`${btn.primary} flex items-center gap-1`}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New option
          </button>
        }
      >
        {methods && methods.length === 0 && (
          <div className="py-8 text-center">
            <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="text-sm text-gray-500">No delivery options yet — checkout needs at least one.</p>
          </div>
        )}

        {methods && methods.length > 0 && (
          <Table headers={['Option', 'Code', 'Price', 'Delivery', 'Orders', 'Status', '']}>
            {methods.map((m) => (
              <tr key={m.id}>
                <td className="px-2 py-2">
                  <p className="font-medium text-gray-900">{m.name}</p>
                  {m.description && <p className="max-w-md truncate text-xs text-gray-500">{m.description}</p>}
                </td>
                <td className="px-2 py-2 font-mono text-xs text-gray-600">{m.code}</td>
                <td className="whitespace-nowrap px-2 py-2 text-gray-900">{m.price.formatted}</td>
                <td className="whitespace-nowrap px-2 py-2 text-gray-600">
                  {m.etaDays[0] === m.etaDays[1]
                    ? `${m.etaDays[0]} days`
                    : `${m.etaDays[0]}–${m.etaDays[1]} days`}
                </td>
                <td className="px-2 py-2 text-gray-600">{m.orderCount}</td>
                <td className="px-2 py-2">
                  {m.isActive ? <Pill tone="green">offered</Pill> : <Pill tone="gray">hidden</Pill>}
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => toggleActive(m)} className={btn.secondary}>
                      {m.isActive ? 'Hide' : 'Offer'}
                    </button>
                    <button type="button" onClick={() => open(m)} className={`${btn.secondary} flex items-center gap-1`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </button>
                    {user.role === 'admin' && (
                      <button type="button" onClick={() => remove(m)} className={`${btn.danger} flex items-center gap-1`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Delete {m.name}</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <p className="mt-4 text-xs text-gray-500">
          Checkout needs at least one option offered, so the last active one cannot be hidden or
          deleted. An option an order has already used is hidden rather than deleted, so that
          order keeps its delivery details.
        </p>
      </Panel>
    </div>
  );
}
