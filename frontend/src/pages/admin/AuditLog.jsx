import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import { Panel, Table, Pagination, Banner, Pill } from '../../components/admin/ui';

// Colour by what the action does rather than by which module it came from —
// a reviewer scanning the log cares about deletions, not about modules.
function tone(action) {
  if (/delete|reject|refund|cancel/.test(action)) return 'red';
  if (/create|approve/.test(action)) return 'green';
  return 'blue';
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState('');
  const page = Number(params.get('page') || 1);

  const load = useCallback(async () => {
    try { setData(await api(`/admin/audit-log?page=${page}`)); } catch (e) { setBanner(e.message); }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Helmet><title>Audit Log — Voltmarket Admin</title></Helmet>
      <Banner onDismiss={() => setBanner('')}>{banner}</Banner>

      <Panel title={data ? `${data.total} recorded actions` : 'Audit log'}>
        <p className="mb-3 text-xs text-gray-500">
          Every staff action that changes data is written here inside the same transaction as
          the change itself, so the log cannot drift out of step with the data.
        </p>

        {data && (
          <>
            <Table headers={['When', 'Who', 'Action', 'Entity', 'Details']}
              empty={data.entries.length === 0 ? 'Nothing recorded yet.' : null}>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-600">
                    {new Date(e.at).toLocaleString('en-GB')}
                  </td>
                  <td className="px-2 py-2">
                    {e.actor
                      ? <><span className="text-gray-900">{e.actor.name}</span>
                          <span className="block text-xs text-gray-500">{e.actor.email}</span></>
                      : <span className="text-xs text-gray-500">system</span>}
                  </td>
                  <td className="px-2 py-2"><Pill tone={tone(e.action)}>{e.action}</Pill></td>
                  <td className="px-2 py-2 text-xs text-gray-600">
                    {e.entity}{e.entityId ? ` #${e.entityId}` : ''}
                  </td>
                  <td className="px-2 py-2">
                    {e.meta
                      ? <code className="block max-w-sm truncate text-xs text-gray-600" title={JSON.stringify(e.meta)}>
                          {JSON.stringify(e.meta)}
                        </code>
                      : <span className="text-xs text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} totalPages={data.totalPages}
              onPage={(p) => setParams(p > 1 ? { page: String(p) } : {})} />
          </>
        )}
      </Panel>
    </div>
  );
}
