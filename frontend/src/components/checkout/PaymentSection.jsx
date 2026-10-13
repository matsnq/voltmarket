import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Lock, AlertCircle } from 'lucide-react';

// Stripe's Appearance API, tuned to match the rest of the form so the hosted
// fields do not look bolted on.
const appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#1673e6',
    colorText: '#1f2937',
    colorDanger: '#dc2626',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #d1d5db', boxShadow: 'none', padding: '10px 12px' },
    '.Input:focus': { border: '1px solid #1673e6', boxShadow: '0 0 0 3px #d9ecff' },
    '.Label': { fontWeight: '500', color: '#374151' },
  },
};

// Maps Stripe's error codes onto the specific messages the brief asks for:
// insufficient funds, invalid number, expired card, and gateway problems.
function friendlyPaymentError(error) {
  if (!error) return 'Payment could not be completed. Please try again.';
  const code = error.decline_code || error.code;
  switch (code) {
    case 'insufficient_funds':
      return 'Your card was declined for insufficient funds. Try another card.';
    case 'incorrect_number':
    case 'invalid_number':
      return 'That card number is not valid. Check the digits and try again.';
    case 'expired_card':
      return 'That card has expired. Please use a different card.';
    case 'incorrect_cvc':
    case 'invalid_cvc':
      return 'The security code (CVC) is incorrect.';
    case 'card_declined':
      return 'Your bank declined the payment. Contact them or try another card.';
    case 'processing_error':
      return 'The payment provider had a problem processing your card. Please try again in a moment.';
    case 'api_connection_error':
    case 'api_error':
      return 'We could not reach the payment provider. Check your connection and try again.';
    default:
      return error.message || 'Payment could not be completed. Please try again.';
  }
}

function PayForm({ order, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    // Stripe validates card number format, expiry and CVC inside its own
    // iframes before it will submit — the card details never reach our page.
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(friendlyPaymentError(submitError));
      setSubmitting(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/${order.reference}?paid=1`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(friendlyPaymentError(confirmError));
      setSubmitting(false);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        {submitting ? 'Processing…' : `Pay ${order.total.formatted}`}
      </button>

      <p className="mt-3 text-center text-xs text-gray-500">
        Card details are entered directly into Stripe&apos;s secure fields and never reach
        this server.
      </p>
    </form>
  );
}

export default function PaymentSection({ order, onSuccess }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/payments/intent/${order.id}`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: 'error', message: data.error || 'Could not start the payment' });
          return;
        }
        setState({
          status: 'ready',
          clientSecret: data.clientSecret,
          stripePromise: loadStripe(data.publicKey),
        });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'We could not reach the payment service. Check your connection and retry.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  if (state.status === 'loading') {
    return <p className="text-sm text-gray-500">Preparing secure payment…</p>;
  }

  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Payment is unavailable</p>
        <p className="mt-1">{state.message}</p>
        <p className="mt-2 text-xs">
          Your order <strong>{order.reference}</strong> has been saved and the items are
          reserved. You can pay from your order page once this is resolved.
        </p>
      </div>
    );
  }

  return (
    <Elements
      stripe={state.stripePromise}
      options={{ clientSecret: state.clientSecret, appearance }}
    >
      <PayForm order={order} onSuccess={onSuccess} />
    </Elements>
  );
}
