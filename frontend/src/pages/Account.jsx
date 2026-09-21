import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, ShieldOff, KeyRound, Copy } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { validateName, validateOtp } from '../lib/validators';
import FormField from '../components/FormField';

function Section({ title, children }) {
  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export default function Account() {
  const { user, loading, setUser, logoutAll } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10" aria-busy="true">
        <p className="text-sm text-gray-500">Loading your account…</p>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Helmet>
        <title>Your Account — Voltmarket</title>
        <meta
          name="description"
          content="Manage your Voltmarket profile, security settings and two-factor authentication."
        />
      </Helmet>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Your account</h1>

      {user.role === 'admin' && !user.totpEnabled && (
        <div role="alert" className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Admin accounts must have two-factor authentication.</strong> Admin features stay
          locked until you enroll below.
        </div>
      )}

      <ProfileSection user={user} setUser={setUser} />
      <TwoFactorSection user={user} setUser={setUser} autoStart={searchParams.get('setup2fa') === '1'} />

      <Section title="Sessions">
        <p className="mb-3 text-sm text-gray-600">
          Log out on every device — revokes all refresh tokens and this access token.
        </p>
        <button
          type="button"
          onClick={logoutAll}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Log out everywhere
        </button>
      </Section>
    </main>
  );
}

function ProfileSection({ user, setUser }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [status, setStatus] = useState(null); // {ok, message}
  const [saving, setSaving] = useState(false);

  async function onSave(e) {
    e.preventDefault();
    const nameError = validateName(name);
    if (nameError) return setStatus({ ok: false, message: nameError });
    setSaving(true);
    try {
      const data = await api('/auth/me', {
        method: 'PATCH',
        body: { name: name.trim(), phone: phone.trim() || null },
      });
      setUser(data.user);
      setStatus({ ok: true, message: 'Profile saved.' });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Profile">
      <form onSubmit={onSave} noValidate>
        <FormField label="Full name" value={name} onChange={setName} autoComplete="name" required />
        <FormField
          label="Phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          hint="Stored encrypted (AES-256-GCM) — optional"
        />
        <p className="mb-4 text-sm text-gray-500">
          Email: <span className="font-medium text-gray-800">{user.email}</span>
        </p>
        {status && (
          <p
            role="status"
            className={`mb-3 text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`}
          >
            {status.message}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Section>
  );
}

function TwoFactorSection({ user, setUser, autoStart }) {
  const [setup, setSetup] = useState(null); // { qrDataUrl, secret }
  const [otp, setOtp] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoStart && !user.totpEnabled) startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      setSetup(await api('/auth/2fa/setup', { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    if (!/^[0-9]{6}$/.test(otp.trim())) return setError('Enter the 6-digit code from your app');
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/2fa/enable', { method: 'POST', body: { otp: otp.trim() } });
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setUser({ ...user, totpEnabled: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable(e) {
    e.preventDefault();
    const otpError = validateOtp(otp);
    if (otpError) return setError(otpError);
    setBusy(true);
    setError('');
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: { otp: otp.trim() } });
      setUser({ ...user, totpEnabled: false });
      setOtp('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Two-factor authentication">
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {recoveryCodes && (
        <div className="mb-4 rounded-lg bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Save these recovery codes now — they are shown only once
          </p>
          <ul className="mb-3 grid grid-cols-2 gap-1 font-mono text-sm text-amber-900">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            className="flex items-center gap-1 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy all
          </button>
        </div>
      )}

      {user.totpEnabled ? (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-green-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Enabled — logins require your
            authenticator app
          </p>
          {user.role === 'admin' ? (
            <p className="text-sm text-gray-500">Admins cannot disable two-factor authentication.</p>
          ) : (
            <form onSubmit={disable} noValidate className="max-w-xs">
              <FormField
                label="Code (to disable)"
                value={otp}
                onChange={setOtp}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
                Disable 2FA
              </button>
            </form>
          )}
        </div>
      ) : setup ? (
        <form onSubmit={confirmEnable} noValidate>
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
            <li>Scan this QR code with Google Authenticator, Authy or any TOTP app:</li>
          </ol>
          <img
            src={setup.qrDataUrl}
            alt="QR code for enrolling this account in your authenticator app"
            className="mb-2 h-44 w-44 rounded-lg border border-gray-200"
          />
          <p className="mb-4 text-xs text-gray-500">
            Can&apos;t scan? Enter the secret manually:{' '}
            <code className="rounded bg-gray-100 px-1 font-mono">{setup.secret}</code>
          </p>
          <div className="max-w-xs">
            <FormField
              label="Enter the 6-digit code to confirm"
              value={otp}
              onChange={setOtp}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Verifying…' : 'Turn on 2FA'}
          </button>
        </form>
      ) : (
        <div>
          <p className="mb-3 text-sm text-gray-600">
            Add a second factor: even with your password, nobody gets in without your phone.
          </p>
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Set up 2FA
          </button>
        </div>
      )}
    </Section>
  );
}
