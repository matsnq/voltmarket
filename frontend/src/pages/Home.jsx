import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <Helmet>
        <title>Voltmarket — Electric Cars &amp; EV Gear Online</title>
        <meta
          name="description"
          content="Shop new electric cars, home chargers and EV accessories at Voltmarket. Compare range, battery and price — fast delivery and secure checkout."
        />
      </Helmet>
      <Zap className="mx-auto mb-4 h-12 w-12 text-brand-600" aria-hidden="true" />
      <h1 className="text-4xl font-bold text-brand-900">Voltmarket</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
        Electric cars, chargers and accessories. The storefront pages arrive with Project 3 —
        the API already serves the full catalog with faceted search.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        {user ? (
          <Link
            to="/account"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Manage your account
          </Link>
        ) : (
          <>
            <Link
              to="/register"
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Create an account
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
