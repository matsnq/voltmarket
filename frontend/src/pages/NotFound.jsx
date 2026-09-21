import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <Helmet>
        <title>Page Not Found — Voltmarket</title>
      </Helmet>
      <p className="text-6xl font-bold text-brand-200" aria-hidden="true">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">This page took a wrong exit</h1>
      <p className="mt-2 text-sm text-gray-600">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Back to the homepage
      </Link>
    </main>
  );
}
