// All money is stored and calculated as integer cents. Floating point cannot
// represent 0.1 exactly, so repeated float arithmetic drifts — unacceptable
// for prices and order totals. Conversion to a display string happens once,
// at the edge.
function formatPrice(cents, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100);
}

function money(cents, currency = 'EUR') {
  return { cents, currency, formatted: formatPrice(cents, currency) };
}

module.exports = { formatPrice, money };
