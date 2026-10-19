import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, Star } from 'lucide-react';
import { api } from '../../lib/api';
import { EMPTY_ADDRESS, validateAddress, formatAddress } from '../../lib/address';
import { serverErrorsToFields } from '../../lib/validators';
import AddressFields from './AddressFields';

export default function Addresses() {
  const [addresses, setAddresses] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | address id
  const [draft, setDraft] = useState(EMPTY_ADDRESS);
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // {ok, message}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/addresses');
      setAddresses(data.addresses);
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing('new');
    setDraft(EMPTY_ADDRESS);
    setLabel('');
    setErrors({});
    setStatus(null);
  }

  function openEdit(a) {
    setEditing(a.id);
    setDraft({
      recipient: a.recipient,
      street: a.street,
      city: a.city,
      postalCode: a.postalCode,
      country: a.country,
      phone: a.phone || '',
    });
    setLabel(a.label || '');
    setErrors({});
    setStatus(null);
  }

  async function save(e) {
    e.preventDefault();
    const found = validateAddress(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setStatus(null);
    const body = {
      ...draft,
      phone: draft.phone?.trim() ? draft.phone.trim() : undefined,
      ...(label.trim() ? { label: label.trim() } : {}),
    };
    try {
      if (editing === 'new') await api('/addresses', { method: 'POST', body });
      else await api(`/addresses/${editing}`, { method: 'PATCH', body });
      setStatus({ ok: true, message: editing === 'new' ? 'Address saved.' : 'Address updated.' });
      setEditing(null);
      await load();
    } catch (err) {
      // Field-level errors from the server win over the generic message.
      const fields = serverErrorsToFields(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(a) {
    setBusy(true);
    try {
      await api(`/addresses/${a.id}`, {
        method: 'PATCH',
        body: {
          recipient: a.recipient,
          street: a.street,
          city: a.city,
          postalCode: a.postalCode,
          country: a.country,
          ...(a.phone ? { phone: a.phone } : {}),
          ...(a.label ? { label: a.label } : {}),
          isDefault: true,
        },
      });
      setStatus({ ok: true, message: 'Default delivery address updated.' });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (!window.confirm(`Remove the address at ${a.street}?`)) return;
    setBusy(true);
    try {
      await api(`/addresses/${a.id}`, { method: 'DELETE' });
      setStatus({ ok: true, message: 'Address removed.' });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="addresses-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="addresses-heading" className="text-lg font-semibold text-gray-900">
          Delivery addresses
        </h2>
        {editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add address
          </button>
        )}
      </div>

      {status && (
        <p
          role="status"
          className={`mb-4 rounded-lg px-4 py-2 text-sm ${
            status.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {status.message}
        </p>
      )}

      {editing !== null && (
        <form onSubmit={save} noValidate className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">
            {editing === 'new' ? 'New address' : 'Edit address'}
          </h3>
          <div className="mb-4">
            <label htmlFor="addr-label" className="mb-1 block text-sm font-medium text-gray-700">
              Label (optional)
            </label>
            <input
              id="addr-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Office…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <AddressFields
            address={draft}
            errors={errors}
            idPrefix="addr"
            onChange={(next, field) => {
              setDraft(next);
              if (field) setErrors((e) => ({ ...e, [field]: null }));
            }}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save address'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {addresses === null && <p className="text-sm text-gray-500">Loading your addresses…</p>}

      {addresses?.length === 0 && editing === null && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900">No saved addresses yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Addresses you use at checkout are saved here automatically.
          </p>
        </div>
      )}

      {addresses && addresses.length > 0 && (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                    {a.label || a.recipient}
                    {a.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                        <Star className="h-3 w-3 fill-brand-600 text-brand-600" aria-hidden="true" />
                        Default
                      </span>
                    )}
                  </p>
                  {a.label && <p className="text-sm text-gray-700">{a.recipient}</p>}
                  <p className="text-sm text-gray-600">{formatAddress(a)}</p>
                  {a.phone && <p className="text-sm text-gray-500">{a.phone}</p>}
                </div>
                <div className="flex flex-none flex-wrap gap-2">
                  {!a.isDefault && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => makeDefault(a)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(a)}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(a)}
                    className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove address at {a.street}</span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
