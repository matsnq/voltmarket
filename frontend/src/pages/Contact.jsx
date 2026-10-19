import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Mail, MessageSquare, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { validateEmail, serverErrorsToFields } from '../lib/validators';
import FormField from '../components/FormField';

const TOPICS = [
  ['order', 'An order I placed'],
  ['product', 'A product question'],
  ['returns', 'Returns or refunds'],
  ['technical', 'Something on the site is broken'],
  ['other', 'Something else'],
];

function validate(form) {
  const e = {};
  if (!form.name || form.name.trim().length < 2) e.name = 'Tell us your name';
  const emailError = validateEmail(form.email);
  if (emailError) e.email = emailError;
  if (!form.topic) e.topic = 'Choose what your message is about';
  if (!form.subject || form.subject.trim().length < 3) e.subject = 'Add a short subject';
  if (!form.message || form.message.trim().length < 20)
    e.message = 'Please give us at least a sentence or two';
  if (form.orderReference && !/^VM-[A-Za-z0-9]{6}$/.test(form.orderReference.trim()))
    e.orderReference = 'Order references look like VM-AB12CD';
  return e;
}

export default function Contact() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    topic: '',
    subject: '',
    message: '',
    orderReference: '',
  });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);

  // The silent refresh resolves `user` after this component mounts, so the
  // initial state above is still empty for a signed-in visitor. Fill the two
  // fields we know once it arrives — but never overwrite typing in progress.
  useEffect(() => {
    if (!user || touched) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.name || '',
      email: f.email || user.email || '',
    }));
  }, [user, touched]);

  const set = (field) => (value) => {
    setTouched(true);
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: null }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSending(true);
    setServerError('');
    try {
      await api('/contact', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          topic: form.topic,
          subject: form.subject.trim(),
          message: form.message.trim(),
          ...(form.orderReference.trim()
            ? { orderReference: form.orderReference.trim().toUpperCase() }
            : {}),
        },
      });
      setSent(true);
    } catch (err) {
      const fields = serverErrorsToFields(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      setServerError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Helmet>
        <title>Contact Support — Voltmarket</title>
        <meta
          name="description"
          content="Get in touch with the Voltmarket support team about an order, a product, a return or a technical problem. We reply within one working day."
        />
      </Helmet>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">Contact us</h1>
      <p className="mb-8 max-w-2xl text-gray-600">
        Questions about an order, a charger that will not pair, or a return you want to start —
        send it here and a person will read it.
      </p>

      <section aria-labelledby="reach-us" className="mb-8 grid gap-4 sm:grid-cols-3">
        <h2 id="reach-us" className="sr-only">How to reach us</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Mail className="mb-2 h-5 w-5 text-brand-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-gray-900">Email</h3>
          <p className="text-sm text-gray-600">support@voltmarket.local</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Clock className="mb-2 h-5 w-5 text-brand-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-gray-900">Hours</h3>
          <p className="text-sm text-gray-600">Mon–Fri, 9:00–17:00 EET</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <MessageSquare className="mb-2 h-5 w-5 text-brand-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-gray-900">Response time</h3>
          <p className="text-sm text-gray-600">Within one working day</p>
        </div>
      </section>

      {sent ? (
        <section
          aria-labelledby="sent-heading"
          className="rounded-xl border border-green-200 bg-green-50 p-6 text-center"
        >
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" aria-hidden="true" />
          <h2 id="sent-heading" className="text-xl font-semibold text-green-900">
            Message sent
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-green-800">
            We have emailed a copy to {form.email}. Our support team aims to reply within one
            working day.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              to="/products"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Keep shopping
            </Link>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setForm((f) => ({ ...f, topic: '', subject: '', message: '', orderReference: '' }));
              }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Send another message
            </button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="form-heading">
          <h2 id="form-heading" className="mb-4 text-xl font-semibold text-gray-900">
            Send us a message
          </h2>

          {serverError && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormField
                label="Your name"
                value={form.name}
                onChange={set('name')}
                error={errors.name}
                autoComplete="name"
                required
              />
              <FormField
                label="Your email"
                type="email"
                value={form.email}
                onChange={set('email')}
                error={errors.email}
                autoComplete="email"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="topic" className="mb-1 block text-sm font-medium text-gray-700">
                What is this about? <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <select
                id="topic"
                value={form.topic}
                onChange={(e) => set('topic')(e.target.value)}
                aria-invalid={errors.topic ? 'true' : undefined}
                aria-describedby={errors.topic ? 'topic-error' : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Choose a topic…</option>
                {TOPICS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {errors.topic && (
                <p id="topic-error" role="alert" className="mt-1 text-xs text-red-600">
                  {errors.topic}
                </p>
              )}
            </div>

            <FormField
              label="Subject"
              value={form.subject}
              onChange={set('subject')}
              error={errors.subject}
              required
            />

            {(form.topic === 'order' || form.topic === 'returns') && (
              <FormField
                label="Order reference (optional)"
                value={form.orderReference}
                onChange={set('orderReference')}
                error={errors.orderReference}
                hint="Looks like VM-AB12CD — you will find it on your confirmation email."
              />
            )}

            <div className="mb-4">
              <label htmlFor="message" className="mb-1 block text-sm font-medium text-gray-700">
                Message <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <textarea
                id="message"
                rows={6}
                maxLength={5000}
                value={form.message}
                onChange={(e) => set('message')(e.target.value)}
                aria-invalid={errors.message ? 'true' : undefined}
                aria-describedby={errors.message ? 'message-error' : 'message-hint'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {errors.message ? (
                <p id="message-error" role="alert" className="mt-1 text-xs text-red-600">
                  {errors.message}
                </p>
              ) : (
                <p id="message-hint" className="mt-1 text-xs text-gray-500">
                  {form.message.length}/5000 characters
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {sending ? 'Sending…' : 'Send message'}
            </button>
            <p className="mt-3 text-xs text-gray-500">
              We use your message only to answer you. See our{' '}
              <Link to="/terms" className="underline hover:text-gray-700">privacy policy</Link>.
            </p>
          </form>
        </section>
      )}
    </main>
  );
}
