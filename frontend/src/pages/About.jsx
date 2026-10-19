import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Zap, Target, Users, Leaf, Github, Linkedin, Mail } from 'lucide-react';

const VALUES = [
  {
    icon: Target,
    title: 'Honest range figures',
    body: 'We publish the WLTP figure and the one our own testers saw in Estonian winter. The second number is usually the one that matters.',
  },
  {
    icon: Leaf,
    title: 'The whole switch, not just the car',
    body: 'A car without a charger is a driveway ornament. We sell the wallbox, the cable and the winter tires in the same basket.',
  },
  {
    icon: Users,
    title: 'Advice before the sale',
    body: 'Our team answers "should I buy this?" honestly, including when the answer is no. Returns cost us less than bad recommendations.',
  },
];

const TEAM = [
  { name: 'Marten Tsimolonskas', role: 'Founder & engineering', initials: 'MT' },
  { name: 'Liis Tamm', role: 'Customer support lead', initials: 'LT' },
  { name: 'Andres Lepik', role: 'Charging specialist', initials: 'AL' },
  { name: 'Maarja Sepp', role: 'Logistics', initials: 'MS' },
];

export default function About() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Helmet>
        <title>About Voltmarket — Our Mission and Team</title>
        <meta
          name="description"
          content="Voltmarket is an Estonian electric vehicle retailer selling EVs, home chargers and accessories. Meet the team and read what we stand for."
        />
      </Helmet>

      <h1 className="mb-3 text-3xl font-bold text-gray-900">About Voltmarket</h1>
      <p className="max-w-2xl text-lg text-gray-600">
        We are an Estonian retailer for people making the switch to electric — the car, the
        charger on the wall, and everything in between.
      </p>

      <section aria-labelledby="mission" className="mt-10">
        <h2 id="mission" className="mb-3 text-xl font-semibold text-gray-900">Our mission</h2>
        <div className="rounded-2xl bg-brand-50 p-6">
          <Zap className="mb-3 h-7 w-7 text-brand-700" aria-hidden="true" />
          <p className="text-gray-800">
            Buying an electric car still involves more homework than it should: three range
            figures for the same model, a charging standard nobody explains, and a quote for home
            installation that arrives a week later. We want the whole decision to fit on one page,
            with numbers you can trust and a cart that includes everything you actually need on
            day one.
          </p>
        </div>
      </section>

      <section aria-labelledby="values" className="mt-10">
        <h2 id="values" className="mb-4 text-xl font-semibold text-gray-900">What we stand for</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-gray-200 bg-white p-5">
              <Icon className="mb-3 h-6 w-6 text-brand-600" aria-hidden="true" />
              <h3 className="mb-1 font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="team" className="mt-10">
        <h2 id="team" className="mb-4 text-xl font-semibold text-gray-900">The team</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((person) => (
            <li key={person.name} className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800"
              >
                {person.initials}
              </span>
              <h3 className="font-semibold text-gray-900">{person.name}</h3>
              <p className="text-sm text-gray-600">{person.role}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="company" className="mt-10">
        <h2 id="company" className="mb-4 text-xl font-semibold text-gray-900">Company details</h2>
        <dl className="grid gap-x-8 gap-y-2 rounded-xl border border-gray-200 bg-white p-5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-gray-100 py-1.5">
            <dt className="text-gray-500">Registered name</dt>
            <dd className="font-medium text-gray-900">Voltmarket OÜ</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-gray-100 py-1.5">
            <dt className="text-gray-500">Founded</dt>
            <dd className="font-medium text-gray-900">2024</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-gray-100 py-1.5">
            <dt className="text-gray-500">Address</dt>
            <dd className="font-medium text-gray-900">Pärnu mnt 142, Tallinn</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-gray-100 py-1.5">
            <dt className="text-gray-500">Ships to</dt>
            <dd className="font-medium text-gray-900">16 EU countries</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500">
          Voltmarket is a student project built for the kood/Jõhvi curriculum. The shop is fully
          functional but no real orders are fulfilled and no real money changes hands.
        </p>
      </section>

      <section aria-labelledby="follow" className="mt-10">
        <h2 id="follow" className="mb-4 text-xl font-semibold text-gray-900">Follow us</h2>
        <ul className="flex flex-wrap gap-3">
          {[
            [Github, 'GitHub', 'https://github.com'],
            [Linkedin, 'LinkedIn', 'https://www.linkedin.com'],
            [Mail, 'Email support', '/contact'],
          ].map(([Icon, label, href]) => {
            const external = href.startsWith('http');
            const className =
              'flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50';
            return (
              <li key={label}>
                {external ? (
                  <a href={href} className={className} rel="noopener noreferrer" target="_blank">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <Link to={href} className={className}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
