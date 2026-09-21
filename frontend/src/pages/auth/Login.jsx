import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getPublicConfig } from '../../lib/api';
import { validateEmail, validateOtp } from '../../lib/validators';
import FormField from '../../components/FormField';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', otp: '' });
  const [needsOtp, setNeedsOtp] = useState(false);
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(
    searchParams.get('oauth') === 'failed' ? 'Google sign-in failed. Please try again.' : ''
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPublicConfig().then(setConfig);
  }, []);

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: null }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    const nextErrors = {
      email: validateEmail(form.email),
      password: form.password ? null : 'Password is required',
      otp: needsOtp ? validateOtp(form.otp) : null,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setGlobalError('');
    try {
      const data = await login(form.email.trim(), form.password, needsOtp ? form.otp.trim() : undefined);
      navigate(data.requires2faSetup ? '/account?setup2fa=1' : '/', { replace: true });
    } catch (err) {
      if (err.details && err.details.code === '2FA_REQUIRED') {
        setNeedsOtp(true); // second step: same form, extra field
      } else {
        setGlobalError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Helmet>
        <title>Log In — Voltmarket</title>
        <meta
          name="description"
          content="Log in to your Voltmarket account to manage orders, addresses and security settings."
        />
      </Helmet>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Log in</h1>

      {globalError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          required
        />
        <FormField
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="current-password"
          required
        />

        {needsOtp && (
          <div className="mb-2 rounded-lg bg-brand-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-brand-900">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Two-factor authentication is enabled on this account
            </p>
            <FormField
              label="Authenticator code"
              value={form.otp}
              onChange={set('otp')}
              error={errors.otp}
              autoComplete="one-time-code"
              inputMode="numeric"
              hint="6-digit app code, or one of your recovery codes"
              required
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Logging in…' : needsOtp ? 'Verify and log in' : 'Log in'}
        </button>
      </form>

      {config?.googleEnabled && (
        <a
          href="/api/v1/auth/google"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1L1.2 17.2C3.2 21.2 7.3 24 12 24z"
            />
            <path fill="#FBBC05" d="M5 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.2 6.8C.4 8.4 0 10.1 0 12s.4 3.6 1.2 5.2L5 14.3z" />
            <path
              fill="#EA4335"
              d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.3-3.2C18 1.3 15.2 0 12 0 7.3 0 3.2 2.8 1.2 6.8L5 9.7c1-2.9 3.8-5.1 7-5.1z"
            />
          </svg>
          Continue with Google
        </a>
      )}

      <div className="mt-4 flex justify-between text-sm text-gray-600">
        <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">
          Forgot password?
        </Link>
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </div>
    </main>
  );
}
