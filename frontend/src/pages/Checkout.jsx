import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Truck, Mail, MapPin } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../lib/api';
import { validateEmail, serverErrorsToFields } from '../lib/validators';
import FormField from '../components/FormField';
import OrderSummary from '../components/checkout/OrderSummary';
import Stepper from '../components/checkout/Stepper';
import PaymentSection from '../components/checkout/PaymentSection';

const COUNTRIES = [
  ['EE', 'Estonia'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['FI', 'Finland'],
  ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['PL', 'Poland'],
  ['DE', 'Germany'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['FR', 'France'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['AT', 'Austria'], ['IE', 'Ireland'],
];

// Client-side mirrors of the server's zod rules, so mistakes surface without
// a round trip. The server remains the authority.
function validateAddress(a) {
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

export default function Checkout() {
  const { cart, loading: cartLoading, updateItem, removeItem, refresh } = useCart();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [methods, setMethods] = useState([]);
  const [methodId, setMethodId] = useState(null);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState({
    recipient: '',
    street: '',
    city: '',
    postalCode: '',
    country: 'EE',
    phone: '',
  });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [busyLines, setBusyLines] = useState(false);
  const [order, setOrder] = useState(null); // set once placed -> payment step

  useEffect(() => {
    api('/shipping-methods')
      .then((d) => {
        setMethods(d.shippingMethods);
        if (d.shippingMethods.length) setMethodId(d.shippingMethods[0].id);
      })
      .catch(() => setGlobalError('Could not load shipping options. Please reload the page.'));
  }, []);

  const [savedAddresses, setSavedAddresses] = useState([]);

  // Prefill everything we already know about a signed-in shopper: profile
  // first, then their saved delivery address if they have one.
  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email);
    setAddress((prev) => ({
      ...prev,
      recipient: prev.recipient || user.name || '',
      phone: prev.phone || user.phone || '',
    }));

    api('/addresses')
      .then((d) => {
        setSavedAddresses(d.addresses);
        const preferred = d.addresses.find((a) => a.isDefault) || d.addresses[0];
        if (!preferred) return;
        // Only fill blanks — never overwrite something already typed.
        setAddress((prev) => ({
          recipient: prev.recipient || preferred.recipient || '',
          street: prev.street || preferred.street || '',
          city: prev.city || preferred.city || '',
          postalCode: prev.postalCode || preferred.postalCode || '',
          country: preferred.country || prev.country,
          phone: prev.phone || preferred.phone || '',
        }));
      })
      .catch(() => {});
  }, [user]);

  function useSavedAddress(saved) {
    setAddress({
      recipient: saved.recipient || '',
      street: saved.street || '',
      city: saved.city || '',
      postalCode: saved.postalCode || '',
      country: saved.country,
      phone: saved.phone || '',
    });
    setErrors({});
  }

  const selectedMethod = useMemo(
    () => methods.find((m) => m.id === methodId) || null,
    [methods, methodId]
  );

  const hasStockProblem = cart.items.some((i) => i.exceedsStock || i.unavailable);

  async function onUpdateQty(itemId, quantity) {
    setBusyLines(true);
    await updateItem(itemId, quantity);
    setBusyLines(false);
  }

  async function onRemove(itemId) {
    setBusyLines(true);
    await removeItem(itemId);
    setBusyLines(false);
  }

  async function placeOrder(e) {
    e.preventDefault();
    const emailError = validateEmail(email);
    const addressErrors = validateAddress(address);
    const next = { ...addressErrors, ...(emailError ? { email: emailError } : {}) };
    if (!methodId) next.shippingMethod = 'Choose a delivery option';
    setErrors(next);
    setGlobalError('');
    if (Object.keys(next).length) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    setPlacing(true);
    try {
      const payload = {
        email: email.trim(),
        shippingMethodId: methodId,
        shippingAddress: {
          recipient: address.recipient.trim(),
          street: address.street.trim(),
          city: address.city.trim(),
          postalCode: address.postalCode.trim(),
          country: address.country,
          ...(address.phone.trim() ? { phone: address.phone.trim() } : {}),
        },
      };
      const data = await api('/checkout', { method: 'POST', body: payload });
      setOrder(data.order);
      await refresh(); // the cart is now empty
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const fieldErrors = serverErrorsToFields(err);
        // Server paths are nested (shippingAddress.city) — flatten for the form.
        const flat = {};
        for (const [k, v] of Object.entries(fieldErrors)) flat[k.split('.').pop()] = v;
        setErrors(flat);
      }
      setGlobalError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  if (cartLoading || authLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16" aria-busy="true">
        <p className="text-sm text-gray-500">Loading checkout…</p>
      </main>
    );
  }

  if (!order && cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <Helmet>
          <title>Checkout — Voltmarket</title>
        </Helmet>
        <h1 className="text-2xl font-bold text-gray-900">Your cart is empty</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add a car or some gear before checking out.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Browse the shop
        </Link>
      </main>
    );
  }

  const summaryCart = order
    ? {
        items: order.items.map((i) => ({
          id: i.id,
          name: i.name,
          image: i.image,
          imageAlt: i.name,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          quantity: i.quantity,
          stockQuantity: i.quantity,
          exceedsStock: false,
        })),
        subtotal: order.subtotal,
      }
    : cart;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>Secure Checkout — Voltmarket</title>
        <meta
          name="description"
          content="Complete your Voltmarket order: delivery details, shipping options and secure card payment."
        />
      </Helmet>

      <h1 className="sr-only">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Left: live order summary */}
        <OrderSummary
          cart={summaryCart}
          shippingMethod={
            order
              ? { name: order.shippingMethod?.name || 'Delivery', price: order.shipping }
              : selectedMethod
          }
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          busy={busyLines || Boolean(order)}
        />

        {/* Right: one page, two sections, no navigation between them */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <Stepper current={order ? 'payment' : 'information'} />

          {globalError && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {globalError}
            </div>
          )}

          {order ? (
            <section aria-labelledby="payment-heading">
              <h2 id="payment-heading" className="mb-1 text-lg font-semibold text-gray-900">
                Enter payment details
              </h2>
              <p className="mb-5 text-sm text-gray-600">
                Order <strong>{order.reference}</strong> is reserved. Pay{' '}
                {order.total.formatted} to confirm it.
              </p>
              <PaymentSection
                order={order}
                onSuccess={() => navigate(`/orders/${order.reference}?paid=1`)}
              />
            </section>
          ) : (
            <form onSubmit={placeOrder} noValidate>
              <section aria-labelledby="contact-heading" className="mb-6">
                <h2
                  id="contact-heading"
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900"
                >
                  <Mail className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  Contact
                </h2>
                <FormField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    setErrors((e) => ({ ...e, email: null }));
                  }}
                  error={errors.email}
                  autoComplete="email"
                  hint="Your order confirmation goes here."
                  required
                />
                {!user && (
                  <p className="-mt-2 text-xs text-gray-500">
                    Checking out as a guest.{' '}
                    <Link to="/login" className="font-medium text-brand-700 hover:underline">
                      Log in
                    </Link>{' '}
                    to save your details and track orders.
                  </p>
                )}
              </section>

              <section aria-labelledby="address-heading" className="mb-6">
                <h2
                  id="address-heading"
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900"
                >
                  <MapPin className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  Delivery address
                </h2>

                {savedAddresses.length > 1 && (
                  <div className="mb-4">
                    <p className="mb-2 text-sm text-gray-600">Use a saved address:</p>
                    <ul className="flex flex-wrap gap-2">
                      {savedAddresses.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => useSavedAddress(a)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 transition hover:border-brand-400 hover:bg-brand-50"
                          >
                            {a.label || `${a.street}, ${a.city}`}
                            {a.isDefault && <span className="ml-1 text-brand-600">(default)</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <FormField
                  label="Recipient name"
                  value={address.recipient}
                  onChange={(v) => {
                    setAddress((a) => ({ ...a, recipient: v }));
                    setErrors((e) => ({ ...e, recipient: null }));
                  }}
                  error={errors.recipient}
                  autoComplete="name"
                  required
                />
                <FormField
                  label="Street address"
                  value={address.street}
                  onChange={(v) => {
                    setAddress((a) => ({ ...a, street: v }));
                    setErrors((e) => ({ ...e, street: null }));
                  }}
                  error={errors.street}
                  autoComplete="street-address"
                  required
                />
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <FormField
                    label="City"
                    value={address.city}
                    onChange={(v) => {
                      setAddress((a) => ({ ...a, city: v }));
                      setErrors((e) => ({ ...e, city: null }));
                    }}
                    error={errors.city}
                    autoComplete="address-level2"
                    required
                  />
                  <FormField
                    label="Postal code"
                    value={address.postalCode}
                    onChange={(v) => {
                      setAddress((a) => ({ ...a, postalCode: v }));
                      setErrors((e) => ({ ...e, postalCode: null }));
                    }}
                    error={errors.postalCode}
                    autoComplete="postal-code"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="country"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Country <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="country"
                    value={address.country}
                    onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField
                  label="Phone (optional)"
                  type="tel"
                  value={address.phone}
                  onChange={(v) => {
                    setAddress((a) => ({ ...a, phone: v }));
                    setErrors((e) => ({ ...e, phone: null }));
                  }}
                  error={errors.phone}
                  autoComplete="tel"
                  hint="For delivery updates. Stored encrypted."
                />
              </section>

              <section aria-labelledby="shipping-heading" className="mb-6">
                <h2
                  id="shipping-heading"
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900"
                >
                  <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  Delivery method
                </h2>
                <fieldset>
                  <legend className="sr-only">Choose a delivery method</legend>
                  <div className="space-y-2">
                    {methods.map((m) => (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                          methodId === m.id
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="shippingMethod"
                          value={m.id}
                          checked={methodId === m.id}
                          onChange={() => setMethodId(m.id)}
                          className="mt-1 h-4 w-4 accent-brand-600"
                        />
                        <span className="flex-1">
                          <span className="flex justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900">{m.name}</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {m.price.formatted}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {m.description} · {m.etaDays[0]}–{m.etaDays[1]} business days
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {errors.shippingMethod && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {errors.shippingMethod}
                  </p>
                )}
              </section>

              {hasStockProblem && (
                <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Some items exceed what we have in stock. Adjust the quantities in the summary
                  to continue.
                </p>
              )}

              <button
                type="submit"
                disabled={placing || hasStockProblem}
                className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
              >
                {placing ? 'Reserving your order…' : 'Continue to payment'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
