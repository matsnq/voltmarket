import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../hooks/useAuth';
import { getPublicConfig } from '../../lib/api';
import {
  validateEmail,
  validatePassword,
  validateName,
  validateConfirm,
  serverErrorsToFields,
} from '../../lib/validators';
import FormField from '../../components/FormField';
import Recaptcha, { resetRecaptcha } from '../../components/Recaptcha';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    getPublicConfig().then(setConfig);
  }, []);

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: null }));
  };

  // Client-side validation mirrors the server rules for instant feedback.
  const checkField = (field) => () => {
    const validators = {
      name: () => validateName(form.name),
      email: () => validateEmail(form.email),
      password: () => validatePassword(form.password),
      confirm: () => validateConfirm(form.password, form.confirm),
    };
    setErrors((e) => ({ ...e, [field]: validators[field]() }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    const nextErrors = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
      captcha: captchaToken ? null : 'Please complete the CAPTCHA',
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setGlobalError('');
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        captchaToken,
      });
      navigate('/account', { replace: true });
    } catch (err) {
      const fieldErrors = serverErrorsToFields(err);
      if (Object.keys(fieldErrors).length) setErrors((prev) => ({ ...prev, ...fieldErrors }));
      else setGlobalError(err.message);
      setCaptchaToken('');
      resetRecaptcha(); // tokens are single-use — the widget must be redone
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Helmet>
        <title>Create an Account — Voltmarket</title>
        <meta
          name="description"
          content="Sign up for Voltmarket to buy electric cars, chargers and EV accessories with secure checkout and order tracking."
        />
      </Helmet>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create your account</h1>

      {globalError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="Full name"
          value={form.name}
          onChange={set('name')}
          onBlur={checkField('name')}
          error={errors.name}
          autoComplete="name"
          required
        />
        <FormField
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          onBlur={checkField('email')}
          error={errors.email}
          autoComplete="email"
          required
        />
        <FormField
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          onBlur={checkField('password')}
          error={errors.password}
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number"
          required
        />
        <FormField
          label="Confirm password"
          type="password"
          value={form.confirm}
          onChange={set('confirm')}
          onBlur={checkField('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
          required
        />

        <Recaptcha siteKey={config?.recaptchaSiteKey} onToken={setCaptchaToken} />
        {errors.captcha && (
          <p role="alert" className="-mt-2 mb-3 text-xs text-red-600">
            {errors.captcha}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
