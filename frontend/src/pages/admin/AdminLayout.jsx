import { NavLink, Outlet, Navigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  LayoutDashboard, Package, FolderTree, ReceiptText, Users, MessageSquareWarning,
  Upload, ScrollText, ShieldAlert, ArrowLeft, Inbox, Truck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const NAV = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'sales', 'support'] },
  { to: '/admin/products', label: 'Products', icon: Package, roles: ['admin', 'sales', 'support'] },
  { to: '/admin/products/import', label: 'Bulk import', icon: Upload, roles: ['admin', 'sales'] },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree, roles: ['admin', 'sales'] },
  { to: '/admin/shipping', label: 'Delivery options', icon: Truck, roles: ['admin', 'sales'] },
  { to: '/admin/orders', label: 'Orders', icon: ReceiptText, roles: ['admin', 'sales', 'support'] },
  { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareWarning, roles: ['admin', 'support'] },
  { to: '/admin/messages', label: 'Support inbox', icon: Inbox, roles: ['admin', 'sales', 'support'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, roles: ['admin'] },
];

const STAFF = ['admin', 'sales', 'support'];

export default function AdminLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16" aria-busy="true">
        <p className="text-sm text-gray-500">Checking your access…</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // The API enforces this too — this only avoids showing a console that would
  // reject every request anyway.
  if (!STAFF.includes(user.role)) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <Helmet>
          <title>Staff Only — Voltmarket</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">Staff access only</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account does not have permission to open the admin console.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand-700 underline">
          Back to the shop
        </Link>
      </main>
    );
  }

  // Admins without 2FA can sign in but every admin API call is refused, so
  // say that here rather than letting them hit errors page by page.
  if (user.role === 'admin' && !user.totpEnabled) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <Helmet>
          <title>Two-Factor Required — Voltmarket</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">Enable two-factor first</h1>
        <p className="mt-2 text-sm text-gray-600">
          Admin accounts must have two-factor authentication enabled before the console
          will accept any action.
        </p>
        <Link
          to="/account?setup2fa=1"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Set up 2FA
        </Link>
      </main>
    );
  }

  const visible = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Helmet>
        {/* The console must never be indexed. */}
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin console</h1>
          <p className="text-sm text-gray-600">
            Signed in as {user.name} · <span className="capitalize">{user.role}</span>
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to shop
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* min-w-0: a grid item defaults to min-width:auto, so without this
            the nav grows to fit its items and the whole page scrolls
            sideways instead of the nav strip scrolling inside itself. */}
        <nav aria-label="Admin sections" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {visible.map(({ to, end, label, icon: Icon }) => (
              <li key={to} className="flex-none">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
