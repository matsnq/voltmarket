import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import { validateEmail } from '../../lib/validators';
import FormField from '../../components/FormField';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const emailError = validateEmail(email);
    setError(emailError);
    if (emailError) return;
    setSubmitting(true);
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Helmet>
        <title>Reset Your Password — Voltmarket</title>
        <meta
          name="description"
          content="Request a password reset link for your Voltmarket account by email."
        />
      </Helmet>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Forgot your password?</h1>
      <p className="mb-6 text-sm text-gray-600">
        Enter your email and we&apos;ll send a reset link. It works once and expires in an hour.
      </p>

      {sent ? (
        <div role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          If that email exists, a reset link is on its way. Check your inbox
          {' '}(in this dev setup: <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">Mailpit</a>).
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError(null);
            }}
            error={error}
            autoComplete="email"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-gray-600">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to login
        </Link>
      </p>
    </main>
  );
}
