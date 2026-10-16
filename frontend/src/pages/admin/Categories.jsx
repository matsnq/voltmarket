import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Table, Banner, btn } from '../../components/admin/ui';

const EMPTY = { name: '', description: '', parentId: '', sortOrder: 0 };

export default function Categories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState(null);
  const [banner, setBanner] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | category object
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/admin/categories');
      setCategories(data.categories);
    } catch (e) { setBanner(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(category) {
    setBanner('');
    setEditing(category || 'new');
    setForm(category
      ? {
          name: category.name,
          description: category.description || '',
          parentId: category.parentId ?? '',
          sortOrder: category.sortOrder ?? 0,
        }
      : EMPTY);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setBanner('');
    const body = {
      name: form.name,
      description: form.description || null,
      parentId: form.parentId === '' ? null : Number(form.parentId),
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (editing === 'new') await api('/admin/categories', { method: 'POST', body });
      else await api(`/admin/categories/${editing.id}`, { method: 'PATCH', body });
      setBanner(`Category ${editing === 'new' ? 'created' : 'updated'}.`);
      setEditing(null);
      await load();
    } catch (e2) { setBanner(e2.message); } finally { setSaving(false); }
  }

  async function remove(category) {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    setBanner('');
    try {
      await api(`/admin/categories/${category.id}`, { method: 'DELETE' });
      setBanner('Category deleted.');
      await load();
    } catch (e) { setBanner(e.message); }
  }

  // A category cannot be its own parent, and (to keep the tree two levels
  // deep, which is what the storefront nav renders) only top-level categories
  // can be chosen as a parent.
  const parentOptions = (categories || []).filter(
    (c) => c.parentId === null && (editing === 'new' || c.id !== editing?.id)
  );

  return (
    <div>
      <Helmet><title>Categories — Voltmarket Admin</title></Helmet>
      <Banner tone={banner.startsWith('Category') ? 'green' : 'red'} onDismiss={() => setBanner('')}>{banner}</Banner>

      {editing && (
        <form onSubmit={save} className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {editing === 'new' ? 'New category' : `Edit ${editing.name}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-name" className="mb-1 block text-sm font-medium text-gray-700">
                Name <span className="text-red-600">*</span>
              </label>
              <input id="cat-name" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="cat-parent" className="mb-1 block text-sm font-medium text-gray-700">Parent</label>
              <select id="cat-parent" value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">No parent (top level)</option>
                {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-desc" className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea id="cat-desc" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="cat-sort" className="mb-1 block text-sm font-medium text-gray-700">Sort order</label>
              <input id="cat-sort" type="number" min="0" max="999" value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-500">Lower numbers appear first in the shop navigation.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className={btn.primary}>
              {saving ? 'Saving…' : 'Save category'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={btn.secondary}>Cancel</button>
          </div>
        </form>
      )}

      <Panel
        title={categories ? `${categories.length} categories` : 'Categories'}
        action={
          <button type="button" onClick={() => open(null)} className={`${btn.primary} flex items-center gap-1`}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New category
          </button>
        }
      >
        {categories && (
          <Table headers={['Name', 'Slug', 'Parent', 'Products', 'Sort', '']}
            empty={categories.length === 0 ? 'No categories yet.' : null}>
            {categories.map((c) => {
              const parent = categories.find((p) => p.id === c.parentId);
              return (
                <tr key={c.id}>
                  <td className="px-2 py-2">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.description && <p className="max-w-md truncate text-xs text-gray-500">{c.description}</p>}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-gray-600">{c.slug}</td>
                  <td className="px-2 py-2 text-gray-600">{parent ? parent.name : '—'}</td>
                  <td className="px-2 py-2 text-gray-600">{c.productCount}</td>
                  <td className="px-2 py-2 text-gray-600">{c.sortOrder}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => open(c)} className={`${btn.secondary} flex items-center gap-1`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      {user.role === 'admin' && (
                        <button type="button" onClick={() => remove(c)} className={`${btn.danger} flex items-center gap-1`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Delete {c.name}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </div>
  );
}
