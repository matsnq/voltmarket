import { Check } from 'lucide-react';

// Progress indicator for the single-page checkout. Nothing navigates — the
// whole form lives on one page; this only shows how far along the shopper is.
export default function Stepper({ current }) {
  const steps = [
    { id: 'information', label: 'Information' },
    { id: 'payment', label: 'Payment' },
    { id: 'completed', label: 'Completed' },
  ];
  const activeIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Checkout progress">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold ${
                done
                  ? 'bg-brand-600 text-white'
                  : active
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={`whitespace-nowrap text-sm font-medium ${
                active ? 'text-gray-900' : done ? 'text-brand-700' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`ml-1 h-px flex-1 ${done ? 'bg-brand-600' : 'bg-gray-200'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
