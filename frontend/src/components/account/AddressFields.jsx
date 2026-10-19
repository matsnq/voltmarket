import FormField from '../FormField';
import { COUNTRIES } from '../../lib/address';

// The address inputs themselves, with no surrounding form or buttons, so
// checkout and the account page can place them in whatever layout they need.
export default function AddressFields({ address, errors = {}, onChange, idPrefix = 'addr' }) {
  const set = (field) => (value) => onChange({ ...address, [field]: value }, field);

  return (
    <>
      <FormField
        label="Recipient name"
        value={address.recipient}
        onChange={set('recipient')}
        error={errors.recipient}
        autoComplete="name"
        required
      />
      <FormField
        label="Street address"
        value={address.street}
        onChange={set('street')}
        error={errors.street}
        autoComplete="street-address"
        required
      />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField
          label="City"
          value={address.city}
          onChange={set('city')}
          error={errors.city}
          autoComplete="address-level2"
          required
        />
        <FormField
          label="Postal code"
          value={address.postalCode}
          onChange={set('postalCode')}
          error={errors.postalCode}
          autoComplete="postal-code"
          required
        />
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-country`} className="mb-1 block text-sm font-medium text-gray-700">
          Country <span className="text-red-600" aria-hidden="true">*</span>
        </label>
        <select
          id={`${idPrefix}-country`}
          value={address.country}
          onChange={(e) => onChange({ ...address, country: e.target.value }, 'country')}
          aria-invalid={errors.country ? 'true' : undefined}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        {errors.country && <p role="alert" className="mt-1 text-xs text-red-600">{errors.country}</p>}
      </div>
      <FormField
        label="Phone (optional)"
        type="tel"
        value={address.phone || ''}
        onChange={set('phone')}
        error={errors.phone}
        autoComplete="tel"
        hint="Couriers use this for delivery notifications. Stored encrypted."
      />
    </>
  );
}
