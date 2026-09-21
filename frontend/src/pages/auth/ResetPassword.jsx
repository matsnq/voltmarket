import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import { validatePassword, validateConfirm } from '../../lib/validators';
import FormField from '../../components/FormField';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const nextErrors = {
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setGlobalError('');
    try {
      await api('/auth/password/reset', {
        method: 'POST',
        body: { token, password: form.password },
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Helmet>
          <title>Invalid Reset Link — Voltmarket</title>
        </Helmet>
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          This reset link is incomplete.{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Helmet>
        <title>Choose a New Password — Voltmarket</title>
        <meta name="description" content="Set a new password for your Voltmarket account." />
      </Helmet>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Choose a new password</h1>

      {globalError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="New password"
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          error={errors.password}
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number"
          required
        />
        <FormField
          label="Confirm new password"
          type="password"
          value={form.confirm}
          onChange={(v) => setForm((f) => ({ ...f, confirm: v }))}
          error={errors.confirm}
          autoComplete="new-password"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </main>
  );
}
