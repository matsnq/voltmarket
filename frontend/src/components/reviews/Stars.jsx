import { Star } from 'lucide-react';

// Read-only star display. The numeric value is in the accessible name, so a
// screen reader gets "4.3 out of 5" rather than five meaningless icons.
export default function Stars({ value, size = 'sm', showValue = false, count }) {
  const px = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const rounded = Math.round(value * 2) / 2;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="flex"
        role="img"
        aria-label={`${value.toFixed(1)} out of 5 stars${count !== undefined ? ` from ${count} reviews` : ''}`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden="true"
            className={`${px} ${n <= rounded ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
          />
        ))}
      </span>
      {showValue && (
        <span className="text-sm text-gray-600">
          {value.toFixed(1)}
          {count !== undefined && ` (${count})`}
        </span>
      )}
    </span>
  );
}

// Interactive rating picker. Implemented as radio inputs so it is keyboard
// navigable with arrow keys and announces correctly, with the stars drawn on
// top of them.
export function StarPicker({ value, onChange, name = 'rating', error }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-gray-700">
        Your rating <span className="text-red-600">*</span>
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer p-0.5"
            title={`${n} star${n > 1 ? 's' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only peer"
            />
            <Star
              aria-hidden="true"
              className={`h-7 w-7 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 ${
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'
              }`}
            />
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''}
            </span>
          </label>
        ))}
        {value > 0 && <span className="ml-2 text-sm text-gray-600">{value} of 5</span>}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
