import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import { Panel, Stat, Table, OrderStatus, Banner } from '../../components/admin/ui';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <Banner>{error}</Banner>;
  if (!stats) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Admin Dashboard — Voltmarket</title>
      </Helmet>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue" value={stats.revenue.formatted} hint="Collected payments only" />
        <Stat
          label="Orders needing action"
          value={stats.orders.awaitingAction}
          hint={`${stats.orders.total} orders in total`}
          to="/admin/orders?status=paid"
        />
        <Stat
          label="Low stock"
          value={stats.lowStock}
          hint="3 or fewer remaining"
          to="/admin/products?status=low"
        />
        <Stat
          label="Reviews to moderate"
          value={stats.pendingReviews}
          hint={`${stats.products} products · ${stats.users} users`}
          to="/admin/reviews?status=pending"
        />
      </div>

      <Panel title="Orders by status">
        <ul className="flex flex-wrap gap-2">
          {Object.entries(stats.orders.byStatus).map(([status, n]) => (
            <li key={status} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5">
              <OrderStatus status={status} />
              <span className="text-sm font-semibold text-gray-900">{n}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Recent orders"
        action={<Link to="/admin/orders" className="text-sm text-brand-700 hover:underline">View all →</Link>}
      >
        <Table headers={['Reference', 'Status', 'Total', 'Placed']}>
          {stats.recentOrders.map((o) => (
            <tr key={o.id}>
              <td className="px-2 py-2">
                <Link to={`/admin/orders/${o.reference}`} className="font-medium text-brand-700 hover:underline">
                  {o.reference}
                </Link>
              </td>
              <td className="px-2 py-2"><OrderStatus status={o.status} /></td>
              <td className="px-2 py-2">{o.total.formatted}</td>
              <td className="px-2 py-2 text-gray-500">
                {new Date(o.placedAt).toLocaleDateString('en-GB')}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
