import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Panel, Table, Pagination, Banner, Pill, btn } from '../../components/admin/ui';

const ROLES = ['customer', 'support', 'sales', 'admin'];

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(null);
  const page = Number(params.get('page') || 1);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) if (v) qs.set(k, v);
    try { setData(await api(`/admin/users?${qs}`)); } catch (e) { setBanner(e.message); }
  }, [params]);
  useEffect(() => { load(); }, [load]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (!v) next.delete(k); else next.set(k, v); }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  async function change(u, body, description) {
    setBusy(u.id); setBanner('');
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      setBanner(`${u.email}: ${description}. Their sessions were revoked immediately.`);
      await load();
    } catch (e) { setBanner(e.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <Helmet><title>Users — Voltmarket Admin</title></Helmet>
      <Banner tone={banner.includes('revoked') ? 'green' : 'red'} onDismiss={() => setBanner('')}>{banner}</Banner>

      <Panel title={data ? `${data.total} users` : 'Users'}>
        <div className="mb-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="role-filter">Filter by role</label>
          <select id="role-filter" value={params.get('role') || ''} onChange={(e) => update({ role: e.target.value })}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {data && (
          <>
            <Table headers={['User', 'Role', '2FA', 'Orders', 'Status', '']}>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-2 py-2">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}{u.id === me.id && ' · you'}</p>
                  </td>
                  <td className="px-2 py-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={busy === u.id || u.id === me.id}
                      onChange={(e) => change(u, { role: e.target.value }, `role set to ${e.target.value}`)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                      title={u.id === me.id ? 'You cannot change your own role' : undefined}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {u.twoFactorEnabled
                      ? <ShieldCheck className="h-4 w-4 text-green-600" aria-label="2FA enabled" />
                      : <ShieldOff className={`h-4 w-4 ${u.role === 'admin' ? 'text-red-500' : 'text-gray-300'}`}
                          aria-label={u.role === 'admin' ? '2FA required but missing' : '2FA not enabled'} />}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{u.orderCount}</td>
                  <td className="px-2 py-2">
                    {u.isActive ? <Pill tone="green">active</Pill> : <Pill tone="gray">disabled</Pill>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy === u.id || u.id === me.id}
                      onClick={() => change(u, { isActive: !u.isActive }, u.isActive ? 'account disabled' : 'account re-enabled')}
                      className={btn.secondary}
                      title={u.id === me.id ? 'You cannot disable your own account' : undefined}
                    >
                      {u.isActive ? 'Disable' : 'Enable'}
                    </button>
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
