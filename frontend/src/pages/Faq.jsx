import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronDown } from 'lucide-react';

// Grouped so the headings form a real hierarchy (h1 → h2 per group → h3 per
// question) rather than one flat list of twenty questions.
const GROUPS = [
  {
    id: 'shipping',
    title: 'Shipping and delivery',
    items: [
      {
        q: 'How long does delivery take?',
        a: 'Accessories ship within one working day and arrive in 2–4 days across the Baltics, 3–7 days elsewhere in the EU. Vehicles are scheduled individually — we contact you within two working days of the order to agree a handover date.',
      },
      {
        q: 'Which countries do you ship to?',
        a: 'Sixteen EU countries: Estonia, Latvia, Lithuania, Finland, Sweden, Denmark, Norway, Poland, Germany, the Netherlands, Belgium, France, Spain, Italy, Austria and Ireland. The checkout will tell you if an address falls outside that list.',
      },
      {
        q: 'How much does shipping cost?',
        a: 'Standard delivery is a flat €4.99 on accessories, with express options shown at checkout. Vehicle delivery is quoted separately and depends on the distance from our Tallinn depot.',
      },
      {
        q: 'Can I track my order?',
        a: 'Yes. Once the order ships we add a tracking number, which appears on the order page and in your order history under Your account → Orders.',
      },
    ],
  },
  {
    id: 'payment',
    title: 'Payment',
    items: [
      {
        q: 'Which payment methods do you accept?',
        a: 'All major credit and debit cards, processed by Stripe. Your card details are entered directly into Stripe’s own hosted fields and never reach our servers.',
      },
      {
        q: 'Is it safe to pay on this site?',
        a: 'The whole site runs over TLS, and card entry happens inside an iframe served by Stripe, so we never see or store a card number. Personal data we do store — your address, phone and email — is encrypted at rest with AES-256-GCM.',
      },
      {
        q: 'When am I charged?',
        a: 'At the moment you confirm the order. If payment fails the order stays open and you can retry with a different card from the order page; the stock stays reserved for you for 60 minutes.',
      },
      {
        q: 'Do prices include VAT?',
        a: 'Yes, every price shown includes VAT at the Estonian rate. The order summary breaks out the total before shipping.',
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns and refunds',
    items: [
      {
        q: 'What is your return policy?',
        a: 'Accessories can be returned within 14 days of delivery in resaleable condition, as EU distance-selling rules require. Vehicles have a 14-day cooling-off period that starts at handover, subject to a mileage limit of 300 km.',
      },
      {
        q: 'How do I start a return?',
        a: 'Message us through the contact form with your order reference and what you would like to return. We reply with a return label and instructions within one working day.',
      },
      {
        q: 'How long do refunds take?',
        a: 'We refund to the original card once the return arrives and passes inspection — usually within two working days. Your bank then takes a further 3–5 days to show it.',
      },
      {
        q: 'Can I cancel an order before it ships?',
        a: 'Yes. Open the order from Your account → Orders and use Cancel, as long as it has not entered processing. The stock goes straight back to the catalogue and any payment is refunded in full.',
      },
    ],
  },
  {
    id: 'products',
    title: 'Products and charging',
    items: [
      {
        q: 'Why do you show two range figures?',
        a: 'The first is the official WLTP figure from the manufacturer. The second is what our own testers measured in Estonian winter conditions, which is usually 20–30% lower and a far better guide to what you will actually get.',
      },
      {
        q: 'Which home charger do I need?',
        a: 'Most homes take an 11 kW three-phase wallbox, which fills a typical battery overnight. If your connection is single-phase you want a 7.4 kW unit. Every charger listing says which it is, and support will check your situation if you ask.',
      },
      {
        q: 'Do you install chargers?',
        a: 'We work with certified electricians across Estonia. Add a charger to your cart and mention installation in the contact form, and we will arrange a quote.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    items: [
      {
        q: 'Do I need an account to order?',
        a: 'No — checkout works as a guest. You will need the order reference and the email you used to look the order up afterwards. An account keeps your order history and saved addresses in one place.',
      },
      {
        q: 'How do I enable two-factor authentication?',
        a: 'Go to Your account → Security and scan the QR code with any authenticator app. We will show you recovery codes once; save them somewhere safe.',
      },
      {
        q: 'I forgot my password.',
        a: 'Use the “Forgot password?” link on the login page. We email a reset link that is valid for one hour and can be used once.',
      },
    ],
  },
];

function Question({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-gray-200 last:border-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-medium text-gray-900 hover:text-brand-700"
        >
          {q}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      {open && <p className="pb-4 pr-6 text-sm text-gray-600">{a}</p>}
    </li>
  );
}

export default function Faq() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Helmet>
        <title>FAQ — Shipping, Payment and Returns | Voltmarket</title>
        <meta
          name="description"
          content="Answers to common Voltmarket questions about delivery times, payment security, the 14-day return policy, home charger choice and account security."
        />
      </Helmet>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">Frequently asked questions</h1>
      <p className="mb-6 text-gray-600">
        Shipping, payment, returns and charging — the things people ask us most.
      </p>

      <nav aria-label="Jump to a section" className="mb-8 flex flex-wrap gap-2">
        {GROUPS.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            {group.title}
          </a>
        ))}
      </nav>

      {GROUPS.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="mb-8 scroll-mt-20">
          <h2 id={`${group.id}-heading`} className="mb-2 text-xl font-semibold text-gray-900">
            {group.title}
          </h2>
          <ul className="rounded-xl border border-gray-200 bg-white px-5">
            {group.items.map((item) => (
              <Question key={item.q} {...item} />
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="still-stuck" className="rounded-xl bg-brand-50 p-6 text-center">
        <h2 id="still-stuck" className="text-lg font-semibold text-brand-900">
          Still stuck?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-brand-800">
          If your question is not here, send it over — a person reads every message.
        </p>
        <Link
          to="/contact"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Contact support
        </Link>
      </section>
    </main>
  );
}
