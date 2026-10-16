import { Link } from 'react-router-dom';

// Small shared pieces so the admin screens stay consistent without each one
// re-inventing a table or a status pill.

export function Panel({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES = {
  green: 'bg-green-50 text-green-800',
  amber: 'bg-amber-50 text-amber-900',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-brand-50 text-brand-800',
  gray: 'bg-gray-100 text-gray-700',
};

export function Pill({ tone = 'gray', children }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const ORDER_TONES = {
  pending_payment: 'amber', paid: 'green', payment_failed: 'red',
  processing: 'blue', shipped: 'blue', delivered: 'green',
  cancelled: 'gray', refunded: 'gray',
};

export function OrderStatus({ status }) {
  return <Pill tone={ORDER_TONES[status] || 'gray'}>{status.replace(/_/g, ' ')}</Pill>;
}

// A scrollable table wrapper: wide admin tables must scroll inside their own
// container rather than making the whole page scroll sideways.
export function Table({ headers, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            {headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-sm text-gray-500">{empty}</p>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}

export function Banner({ tone = 'red', children, onDismiss }) {
  if (!children) return null;
  return (
    <div role="alert" className={`mb-4 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${TONES[tone]}`}>
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="flex-none text-xs underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Stat({ label, value, hint, to }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">{body}</div>
  );
}

export const btn = {
  primary: 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50',
  secondary: 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50',
  danger: 'rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50',
};
