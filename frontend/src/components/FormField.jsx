import { useId } from 'react';

// Accessible form field: label always visible, error text tied to the input
// via aria-describedby, invalid state announced with aria-invalid (WCAG).
export default function FormField({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  required,
  hint,
  ...rest
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
