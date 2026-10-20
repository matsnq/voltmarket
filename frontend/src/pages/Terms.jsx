import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck } from 'lucide-react';

const UPDATED = '19 October 2026';

const SECTIONS = [
  ['terms', 'Terms of service'],
  ['orders', 'Orders and pricing'],
  ['returns', 'Returns and cancellation'],
  ['privacy', 'Privacy policy'],
  ['data-we-collect', 'What we collect'],
  ['how-we-use', 'How we use it'],
  ['retention', 'How long we keep it'],
  ['your-rights', 'Your rights'],
  ['cookies', 'Cookies'],
];

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Helmet>
        <title>Terms &amp; Privacy Policy — Voltmarket</title>
        <meta
          name="description"
          content="Voltmarket's terms of service and privacy policy: how orders and returns work, what data we collect, how it is encrypted and your rights under the GDPR."
        />
      </Helmet>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">Terms &amp; privacy</h1>
      <p className="mb-6 text-sm text-gray-500">Last updated {UPDATED}</p>

      <nav aria-label="On this page" className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">On this page</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-brand-700 hover:underline">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="terms" aria-labelledby="terms-h" className="mb-8 scroll-mt-20">
        <h2 id="terms-h" className="mb-3 text-xl font-semibold text-gray-900">Terms of service</h2>
        <p className="mb-3 text-sm text-gray-700">
          By placing an order on Voltmarket you agree to these terms. Voltmarket OÜ,
          Example Street 123, Tallinn, is the seller. These terms do not limit the statutory rights you have as
          a consumer under Estonian and EU law.
        </p>
        <p className="text-sm text-gray-700">
          You must be at least 18 to buy a vehicle. You are responsible for keeping your account
          password confidential, and for anything done through your account.
        </p>
      </section>

      <section id="orders" aria-labelledby="orders-h" className="mb-8 scroll-mt-20">
        <h2 id="orders-h" className="mb-3 text-xl font-semibold text-gray-900">Orders and pricing</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>All prices include VAT at the applicable Estonian rate and are shown in euro.</li>
          <li>
            An order is a binding contract once we confirm it by email. If we cannot fulfil it —
            a pricing error, or stock that sold out in the same second — we will tell you and
            refund in full.
          </li>
          <li>
            Stock is reserved for 60 minutes while you pay. If payment does not complete in that
            window the reservation lapses and the items return to the catalogue.
          </li>
          <li>Risk passes to you on delivery; ownership passes once payment clears.</li>
        </ul>
      </section>

      <section id="returns" aria-labelledby="returns-h" className="mb-8 scroll-mt-20">
        <h2 id="returns-h" className="mb-3 text-xl font-semibold text-gray-900">Returns and cancellation</h2>
        <p className="mb-3 text-sm text-gray-700">
          Under EU distance-selling rules you may withdraw from the purchase within 14 days of
          delivery without giving a reason. Accessories must come back in resaleable condition.
          Vehicles are subject to a 300 km mileage limit during the cooling-off period.
        </p>
        <p className="text-sm text-gray-700">
          We refund to the original payment method within 14 days of the goods arriving back with
          us. You may also cancel an order yourself, from your order page, at any time before it
          enters processing. See the{' '}
          <Link to="/faq" className="text-brand-700 underline">FAQ</Link> for how to start one.
        </p>
      </section>

      <section id="privacy" aria-labelledby="privacy-h" className="mb-8 scroll-mt-20">
        <h2 id="privacy-h" className="mb-3 text-xl font-semibold text-gray-900">Privacy policy</h2>
        <div className="flex gap-3 rounded-xl bg-brand-50 p-4">
          <ShieldCheck className="h-5 w-5 flex-none text-brand-700" aria-hidden="true" />
          <p className="text-sm text-brand-900">
            Voltmarket OÜ is the data controller. We collect the minimum needed to sell you
            something and get it delivered, we encrypt the sensitive parts, and we do not sell
            your data to anyone.
          </p>
        </div>
      </section>

      <section id="data-we-collect" aria-labelledby="collect-h" className="mb-8 scroll-mt-20">
        <h2 id="collect-h" className="mb-3 text-xl font-semibold text-gray-900">What we collect</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Categories of personal data Voltmarket collects</caption>
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th scope="col" className="py-2 pr-4 font-medium">Data</th>
                <th scope="col" className="py-2 pr-4 font-medium">Why</th>
                <th scope="col" className="py-2 font-medium">How it is stored</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4 text-gray-900">Email address</td>
                <td className="py-2 pr-4 text-gray-600">Account, order confirmations</td>
                <td className="py-2 text-gray-600">Encrypted (AES-256-GCM)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-gray-900">Password</td>
                <td className="py-2 pr-4 text-gray-600">Signing you in</td>
                <td className="py-2 text-gray-600">Hashed with bcrypt, never recoverable</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-gray-900">Name, address, phone</td>
                <td className="py-2 pr-4 text-gray-600">Delivering your order</td>
                <td className="py-2 text-gray-600">Encrypted (AES-256-GCM)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-gray-900">Order history</td>
                <td className="py-2 pr-4 text-gray-600">Support, returns, accounting</td>
                <td className="py-2 text-gray-600">Address and email encrypted</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-gray-900">Card details</td>
                <td className="py-2 pr-4 text-gray-600">Taking payment</td>
                <td className="py-2 text-gray-600">Never reach us — handled by Stripe</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="how-we-use" aria-labelledby="use-h" className="mb-8 scroll-mt-20">
        <h2 id="use-h" className="mb-3 text-xl font-semibold text-gray-900">How we use it</h2>
        <p className="mb-3 text-sm text-gray-700">
          To process and deliver orders, answer your support messages, prevent fraud and abuse,
          and meet our accounting obligations. The legal bases are performance of our contract
          with you, our legitimate interest in running the shop securely, and the law.
        </p>
        <p className="text-sm text-gray-700">
          We share data only with the processors that make the shop work: Stripe for payments,
          our delivery partners for the address on your parcel, and our email provider for
          transactional messages. We do not sell personal data, and we do not use it for
          advertising.
        </p>
      </section>

      <section id="retention" aria-labelledby="retention-h" className="mb-8 scroll-mt-20">
        <h2 id="retention-h" className="mb-3 text-xl font-semibold text-gray-900">How long we keep it</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>Account data: until you delete the account.</li>
          <li>Order records: seven years, as Estonian accounting law requires.</li>
          <li>Support messages: two years from the last reply.</li>
          <li>Session and refresh tokens: seven days, or until you log out.</li>
        </ul>
      </section>

      <section id="your-rights" aria-labelledby="rights-h" className="mb-8 scroll-mt-20">
        <h2 id="rights-h" className="mb-3 text-xl font-semibold text-gray-900">Your rights</h2>
        <p className="mb-3 text-sm text-gray-700">
          Under the GDPR you may ask for a copy of your data, have it corrected or erased,
          restrict or object to how we use it, and receive it in a portable format. You may also
          complain to the Estonian Data Protection Inspectorate.
        </p>
        <p className="text-sm text-gray-700">
          To exercise any of these, write to us through the{' '}
          <Link to="/contact" className="text-brand-700 underline">contact form</Link>. We reply
          within one month. Note that order records we must keep for accounting cannot be erased
          before the seven years are up.
        </p>
      </section>

      <section id="cookies" aria-labelledby="cookies-h" className="scroll-mt-20">
        <h2 id="cookies-h" className="mb-3 text-xl font-semibold text-gray-900">Cookies</h2>
        <p className="text-sm text-gray-700">
          We set two cookies, both strictly necessary, so no consent banner is required: a cart
          token that remembers a guest basket, and an httpOnly refresh token that keeps you
          signed in. Neither is used for tracking or advertising, and we run no third-party
          analytics.
        </p>
      </section>

      <p className="mt-10 rounded-lg bg-gray-50 p-4 text-xs text-gray-500">
        Voltmarket is a student project built for the kood/Jõhvi curriculum. The policies above
        describe how the software actually behaves, but no real orders are fulfilled and no real
        money changes hands.
      </p>
    </main>
  );
}
