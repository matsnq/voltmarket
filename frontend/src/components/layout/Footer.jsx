import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

const GROUPS = [
  {
    title: 'Shop',
    links: [
      ['/products', 'All products'],
      ['/products?category=electric-cars', 'Electric cars'],
      ['/products?category=home-chargers', 'Home chargers'],
    ],
  },
  {
    title: 'Help',
    links: [
      ['/contact', 'Contact support'],
      ['/faq', 'FAQ'],
      ['/orders', 'Track an order'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['/about', 'About us'],
      ['/terms', 'Terms & privacy'],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
              <Zap className="h-5 w-5" aria-hidden="true" />
              Voltmarket
            </Link>
            <p className="mt-2 max-w-xs text-sm text-gray-600">
              Electric cars, home chargers and the gear that goes with them. Shipped across
              16 EU countries.
            </p>
          </div>

          {GROUPS.map((group) => (
            <nav key={group.title} aria-labelledby={`footer-${group.title}`}>
              <h2
                id={`footer-${group.title}`}
                className="mb-3 text-sm font-semibold text-gray-900"
              >
                {group.title}
              </h2>
              <ul className="space-y-2">
                {group.links.map(([to, label]) => (
                  <li key={label}>
                    <Link to={to} className="text-sm text-gray-600 transition hover:text-brand-700">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-gray-200 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Voltmarket OÜ · Example Street 123, Tallinn</p>
          <p>A course project — no real cars were sold in the making of this shop.</p>
        </div>
      </div>
    </footer>
  );
}
