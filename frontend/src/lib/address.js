// Shared address rules. Checkout and the account page both collect an
// address, and when the validation lived in Checkout.jsx alone the two were
// one edit away from disagreeing with each other — and with the server.
//
// These are client-side mirrors of the zod schema in
// backend/src/modules/orders/orders.validation.js. The server stays the
// authority; this only saves a round trip on obvious mistakes.

export const COUNTRIES = [
  ['EE', 'Estonia'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['FI', 'Finland'],
  ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['PL', 'Poland'],
  ['DE', 'Germany'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['FR', 'France'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['AT', 'Austria'], ['IE', 'Ireland'],
];

export const EMPTY_ADDRESS = {
  recipient: '',
  street: '',
  city: '',
  postalCode: '',
  country: 'EE',
  phone: '',
};

export function validateAddress(a) {
  const e = {};
  if (!a.recipient || a.recipient.trim().length < 2) e.recipient = 'Recipient name is required';
  else if (!/^[\p{L}\p{N} .,'-]+$/u.test(a.recipient.trim()))
    e.recipient = 'Name contains unsupported characters';
  if (!a.street || a.street.trim().length < 3) e.street = 'Street address is required';
  if (!a.city || !a.city.trim()) e.city = 'City is required';
  if (!a.postalCode || a.postalCode.trim().length < 3) e.postalCode = 'Postal code is required';
  else if (!/^[A-Za-z0-9 -]+$/.test(a.postalCode.trim()))
    e.postalCode = 'Postal code contains unsupported characters';
  if (!a.country) e.country = 'Choose a country';
  if (a.phone && !/^\+?[0-9 ()-]{5,20}$/.test(a.phone.trim()))
    e.phone = 'Enter a valid phone number';
  return e;
}

export function countryName(code) {
  const found = COUNTRIES.find(([c]) => c === code);
  return found ? found[1] : code;
}

// One-line rendering for summaries and the saved-address list.
export function formatAddress(a) {
  return [a.street, `${a.postalCode} ${a.city}`.trim(), countryName(a.country)]
    .filter(Boolean)
    .join(', ');
}
