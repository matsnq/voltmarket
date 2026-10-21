# ⚡ Voltmarket — B2C E-commerce Platform for Electric Cars

Final course task (**i-love-shopping**). Voltmarket is a Business-to-Consumer
web shop selling **electric cars and EV accessories** (chargers, cables, tires,
gear) — built API-first with a React storefront.

> ### 📍 Reviewing this? Start here
>
> **This submission is Project 3 — Experience**: reviews and ratings, the
> admin console, every customer-facing page, security, SEO, accessibility and
> load testing. It completes the platform, so the shop in front of you is the
> finished article rather than a slice of one.
>
> - Criteria answered one by one, with commands that prove each: **[ANSWERS.md](ANSWERS.md)**
> - Running it takes two things only: **Docker** and the **Stripe CLI** →
>   [Setup & installation](#setup--installation)
> - What the load tests found, and where the platform gives out →
>   [Performance analysis report](#performance-analysis-report)
> - Payments need your own Stripe test keys (they cannot be committed) →
>   [Enabling payments](#enabling-payments-reviewers-read-this)
> - **No real card needed** — what to type at checkout:
>   [Test cards](#-test-cards--what-to-type-at-checkout)
> - Sign in as `admin`, `support`, `sales` or a customer to see role-based
>   access differ → [Demo accounts](#demo-accounts)
>
> Projects 1 and 2 were submitted and reviewed earlier. Their answers are
> archived in [ANSWERS-P1.md](ANSWERS-P1.md) and
> [ANSWERS-P2.md](ANSWERS-P2.md); you do not need them here, though the
> current answers link into them where a Project 3 item builds on earlier
> foundations.

## Project overview

| Layer                 | Technology                                           | Why                                                                     |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| API                   | Node.js 24 + Express 4 (modular monolith, `/api/v1`) | Stateless, horizontally scalable, one language across the stack         |
| Database              | PostgreSQL 16                                        | ACID transactions, generated columns, built-in full-text search         |
| Cache / rate limiting | Redis 7                                              | Hot catalog caching, token-bucket rate limiter, JWT revocation denylist |
| Message queue         | RabbitMQ 3.13 (+ dead-letter queue)                  | Async order/payment processing (Project 2)                              |
| Frontend              | React 18 + Vite + Tailwind CSS                       | SPA storefront, access tokens held in memory only                       |
| Edge                  | nginx + self-signed TLS                              | HTTPS termination, static serving, API proxy                            |
| Email                 | Mailpit (dev SMTP + web UI)                          | Password reset & order emails, viewable at `:8025`                      |
| Payments              | Stripe (test mode) + Stripe CLI                      | PCI-friendly: card data never touches this server                       |

**Architecture:** a _modular monolith_ — one Express app with isolated modules
(`auth`, `catalog`, `cart`, `orders`, `payments`, `reviews`, `admin`), each with
its own routes/controller/service/validation. The API is stateless (JWTs +
Redis/Postgres for shared state), so it scales horizontally behind a load
balancer; the queue worker is a separate process consuming RabbitMQ. Any module
can later be split into a microservice without rewriting business logic.

### Status

- ✅ **Project 1 — Foundation**: auth (JWT + rotation, CAPTCHA, 2FA, Google
  OAuth, password reset) with working UI pages, PostgreSQL schema + ERD,
  product catalog with faceted search/suggestions/sorting.
- ✅ **Project 2 — Commerce**: guest and persistent carts with merge on login,
  single-page checkout, Stripe payments through the provider's own secure
  fields, RabbitMQ-driven order processing, order history, cancellations and
  refunds.
- ✅ **Project 3 — Experience**: star ratings with verified-purchase badges and
  helpful voting; a ten-screen admin console with role-based access, bulk
  import, review moderation and an audit log; every page the brief lists,
  including a support inbox behind a working contact form; an SEO pass and a
  WCAG 2.1 Level A pass audited across 22 routes; and a k6 load-test suite
  whose findings are written up in the
  [performance analysis report](#performance-analysis-report).

**188 automated tests** across the whole suite: 55 unit, 118 integration,
15 security.

### How an order flows through the system

```
Checkout  ──►  order: pending_payment          stock reserved under a row lock
                      │
                      ▼
          Stripe PaymentElement (card data never reaches this server)
                      │
                      ▼
          Stripe webhook ──► verify signature ──► publish to RabbitMQ ──► 200
                                                         │
                                                         ▼
                                   worker: update order, adjust stock, email
                                                         │
                       ┌─────────────────────────────────┴───────────────┐
                       ▼                                                 ▼
             order: paid                                    order: payment_failed
             stock stays reserved                           stock released
```

The webhook deliberately does the minimum and returns immediately — Stripe
retries anything slow, so inventory changes and email live in the worker,
behind bounded retries and a dead-letter queue.

## Entity Relationship Diagram

The full ERD with attributes, PK/FK, cardinality and modality lives in
[docs/erd.md](docs/erd.md) (rendered by GitHub/GitLab as a Mermaid diagram).
Condensed view:

```mermaid
erDiagram
    users ||--o{ oauth_accounts : "signs in via"
    users ||--o{ refresh_tokens : "holds sessions"
    users ||--o{ password_reset_tokens : "requests"
    users ||--o{ addresses : "saves"
    users |o--o{ carts : "owns"
    users |o--o{ orders : "places"
    users ||--o{ reviews : "writes"
    users |o--o{ contact_messages : "writes in"
    categories |o--o{ categories : "parent of"
    categories ||--o{ products : "contains"
    brands ||--o{ products : "manufactures"
    products ||--|{ product_images : "displayed with"
    products ||--o{ cart_items : "appears in"
    products ||--o{ order_items : "sold as"
    products ||--o{ reviews : "rated by"
    carts ||--o{ cart_items : "holds"
    orders ||--|{ order_items : "consists of"
    orders ||--o{ payments : "paid via"
    orders ||--o{ refunds : "refunded by"
    shipping_methods ||--o{ orders : "ships"
    reviews ||--o{ review_votes : "voted on"
    users |o--o{ contact_messages : "handles"
```

## Performance analysis report

Measured with [k6](https://k6.io) against the full Docker stack over HTTPS.
The scripts are in [`load-tests/`](load-tests/) and the method is documented
there; this section is the result.

**Test machine.** Apple M3 Pro, 11 cores, 18 GB, macOS 14.6.1. Docker Desktop
with 11 CPUs and 7.65 GiB allocated to the VM. Load generator and system under
test share the machine, so these are lower bounds — a dedicated generator
would push the numbers higher. Container CPU figures come from `docker stats`
and are summed across cores, so 100% means one full core, not the whole
machine.

**Rate limiting was disabled for these runs** (`docker-compose.loadtest.yml`).
Every virtual user comes from one machine and so shares a token bucket of 120
tokens refilling at 2/second; left on, the test would measure the limiter and
50 concurrent users would be unreachable by design. The limiter is verified
separately by the automated test in `backend/tests/security/security.test.js`,
and `baseline.js` asserts that no 429 was seen so a run against a limited
stack fails loudly rather than reporting nonsense.

### Scenarios

Four flows modelling real use, mixed the way traffic mixes — mostly reading,
some searching, a minority buying, a few signing up. All include think time of
1–4 seconds between steps, because without it a test measures how fast a loop
spins rather than how the system behaves under people.

| Flow | Steps | Share of the mix |
| --- | --- | --- |
| Browse | categories → listing → 2 × (product + reviews) | 60% |
| Search | suggestions per keystroke → results → product | 20% |
| Shop | product → add to cart → cart → shipping → checkout | 16% |
| Account | register → login → order history | 4% |

### Objectives: all met at the target load

50 concurrent users for 3 minutes, 7,887 requests, 318 real orders placed.

| Objective | Target | Measured | |
| --- | --- | --- | --- |
| 90% of requests served within | 2 s | **24.9 ms** | ✅ |
| Concurrent users without degradation | 50 | **50** | ✅ |
| Throughput at peak load | ≥ 10 TPS | **41.5 req/s** | ✅ |
| Transactions completing successfully | ≥ 98% | **100%** (8,521/8,521) | ✅ |
| Error rate | < 5% | **0.00%** (0/7,887) | ✅ |

Per-endpoint latency at that load:

| Step | median | p95 |
| --- | --- | --- |
| Search suggestions | 1.7 ms | 14 ms |
| Category listing | 6.3 ms | 40 ms |
| Product detail | 4.7 ms | 43 ms |
| Add to cart | 8.8 ms | 47 ms |
| **Checkout** | 10.7 ms | 54 ms |
| **Login** | 82.6 ms | 95 ms |
| **Register** | 75.6 ms | 131 ms |

Checkout — which locks a stock row, writes an order and its line items inside
one transaction — costs about the same as reading a product page. Login and
registration cost roughly eight times more than anything else, because bcrypt
is deliberately slow. That is the design working as intended, but it is also
the first thing that saturates, as the next section shows.

### Scaling with concurrent users

Each level is its own 90-second run at a fixed number of users, so every row
is one clean data point rather than an average across a ramp.

| Concurrent users | Throughput | p95 | Errors | API CPU | Postgres CPU |
| --- | --- | --- | --- | --- | --- |
| 50 | 33 req/s | 10.4 ms | 0.00% | 21% | 14% |
| 100 | 66 req/s | 8.8 ms | 0.00% | 28% | 26% |
| 200 | 129 req/s | 5.8 ms | 0.39% | 33% | 38% |
| 400 | 255 req/s | 5.3 ms | 0.51% | 46% | 46% |

Throughput scales linearly and latency does not move. That is because think
time, not the server, sets the pace: a browsing user issues roughly six
requests across ten seconds, so 400 users can only generate about 250 requests
a second however fast the server is. At 400 users the API is still under half
a core. **Realistic user concurrency is not what limits this platform**, so
finding the ceiling needs a different kind of test.

### Capacity: where it actually breaks

Think time off, a fixed arrival rate per run, k6 adding virtual users as
needed to sustain it. Rates below are complete user journeys per second; each
issues five to seven HTTP requests.

| Journeys/s | Throughput | p95 | Errors | API CPU | nginx CPU | Postgres CPU |
| --- | --- | --- | --- | --- | --- | --- |
| 200 | 1,082 req/s | 3.2 ms | 0.00% | 64% | 19% | 60% |
| 250 | **1,355 req/s** | 7.2 ms | 0.00% | **90%** | 157% | 111% |
| 300 | 1,569 req/s | 18.5 ms | 32.3% | 102% | 282% | 152% |
| 400 | 1,681 req/s | 3.55 s | 33.8% | 110% | 920% | 169% |
| 500 | 1,415 req/s | 4.88 s | 27.3% | 108% | 899% | 173% |

**Answers to the questions the brief asks:**

- **Maximum sustainable throughput: ~1,355 requests/second.** The last rate
  with zero errors. Beyond it a third of requests fail.
- **Normal vs peak.** The target load of 50 users uses about 3% of that
  ceiling. There is roughly 30× headroom over the stated requirement.
- **Maximum concurrent users before responses exceed 5 s.** Not reachable with
  realistic pacing — at 400 concurrent users p95 was 5.3 **milliseconds**.
  Response times only reach 5 s past saturation, at roughly 1,400–1,700
  req/s, by which point the platform is already refusing a third of requests.
  Dividing the sustainable 1,355 req/s by the ~0.6 req/s an actively browsing
  user generates gives an estimate of **around 2,200 concurrent users**. That
  figure is derived, not directly measured: the load generator shares this
  machine and cannot drive that many users honestly.
- **The load that pushes CPU over 90%: about 1,355 req/s.** The API container
  reaches 90% of one core at exactly the last healthy rate, and errors begin
  on the next step up. Memory never came close — the API peaked at 444 MiB and
  Postgres at 83 MiB, against 7.65 GiB available. **This platform is
  CPU-bound, not memory-bound**, and nothing resembling a memory leak appeared
  across any run.

### Bottlenecks

**1. The API is a single Node process.** This is the binding constraint.
Node runs JavaScript on one thread, so the API container tops out near 100% —
one core — while ten more sit idle. The table above shows it crossing 90% at
1,355 req/s and flattening at ~110% thereafter; throughput then *falls*
(1,681 → 1,415 req/s) as the system spends its time on work it cannot finish,
the classic shape of congestion collapse. When the event loop can no longer
accept connections, nginx returns **502 Bad Gateway** — confirmed in its
access log, where every failed request under overload is a 502. The failure
mode is refusal, not slowness, which is why p95 stays at 18 ms while a third
of requests fail. Running Node's cluster module with one worker per core, or
several API replicas behind the existing nginx, is the single highest-value
change available and needs no application rewrite.

**2. TLS termination is the largest CPU consumer overall.** nginx peaked at
920% — about nine cores — against the API's 110%. It is not the bottleneck,
because nginx is multi-process and scales across cores while the API cannot,
but it means most of the machine's CPU is spent on encryption rather than on
the shop. In production this belongs on a load balancer or CDN edge, which
would free most of the machine.

**3. bcrypt dominates the auth path.** At 82 ms median, login and registration
cost roughly eight times a product page, and that cost is CPU burned inside
the single-threaded API process. Ten logins a second consume most of a core.
The work factor of 10 is a deliberate security choice and should not be
lowered, but it makes authentication the most expensive thing the platform
does and the first to suffer when the API is busy.

**4. Postgres is comfortable throughout.** It peaked at 173% — under two
cores — and 83 MiB while the API was saturated, so the schema, indexes and
`SELECT … FOR UPDATE` locking are not limiting anything at this scale. The
row-level locks that prevent overselling cost nothing measurable: checkout
p95 was 54 ms at the target load, on a par with a read.

### Honest limits of these numbers

- Load generator and system under test share one machine. Past roughly 1,400
  req/s, k6 is competing with Docker for the same cores, so the true ceiling
  on dedicated hardware is higher than reported here.
- Two unrelated containers belonging to another project were running on the
  host. They were excluded from the figures but added background noise.
- The 0.39% and 0.51% error rates at 200 and 400 concurrent users are early
  502s of the same kind seen under overload, not a separate fault.
- Measurements must be taken on mains power. On battery, macOS suspends the
  machine every half minute or so; k6 keeps counting wall-clock time across
  the gap, so a three-minute run reports as nineteen minutes with individual
  requests apparently taking a quarter of an hour. Two early runs were
  discarded for this reason before the cause was found.

## Setup & installation

**Docker** plus the **[Stripe CLI](https://docs.stripe.com/stripe-cli)** (the
payment simulation CLI the brief allows). Nothing else: no Node, Postgres,
Redis or OpenSSL on the host, not even to run the tests.

The shop runs fully without Stripe keys — browsing, carts and order placement
all work, and checkout simply reports that payment is unavailable while still
reserving stock. Supply keys to exercise payments; see below.

```bash
docker compose up --build
```

That single command builds and starts everything: Postgres, Redis, RabbitMQ,
Mailpit, the API, the queue worker, and nginx serving the frontend over TLS.
The API runs its migrations and seeds itself on boot, so a fresh clone
provisions with no extra steps. **The first build takes a few minutes** (it
compiles the SPA and generates a TLS certificate); later starts take seconds.

| URL                             | What                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| https://localhost               | Storefront (self-signed cert — see the warning note below) |
| https://localhost/api/v1/health | API health check                                           |
| http://localhost:8025           | Mailpit — read every email the shop sends                  |
| http://localhost:15672          | RabbitMQ management (guest / guest)                        |

### The certificate warning is expected

The TLS certificate is **self-signed**, generated during the image build, so
no certificate authority vouches for it. Browsers therefore show
`NET::ERR_CERT_AUTHORITY_INVALID` on the first visit. The connection is still
fully encrypted — only the *identity* is unverified, which is inherent to a
self-signed certificate and exactly what the brief asked for.

To continue in Chrome: **Advanced → Proceed to localhost (unsafe)**. If that
link is missing, click the page once and type `thisisunsafe`. Accept it once
before testing Google sign-in, otherwise the OAuth redirect back to
`https://localhost/...` lands on the warning page instead of completing.

### Ports this project uses

Everything is published on the host, so a service already running on one of
these will make `docker compose up` fail with "port is already allocated":

| Port | Service | Port | Service |
| ---- | ------------------------- | ----- | ---------------- |
| 80   | nginx (redirects to HTTPS)| 5672  | RabbitMQ         |
| 443  | nginx (storefront + API)  | 15672 | RabbitMQ web UI  |
| 3000 | API direct (Stripe CLI)   | 8025  | Mailpit web UI   |
| 5433 | PostgreSQL                | 1025  | Mailpit SMTP     |
| 6379 | Redis                     |       |                  |

**3000** and **6379** are the usual culprits on a developer machine. Find the
offender with `lsof -i :3000` (macOS/Linux) and stop it, or change the
left-hand number of that mapping in `docker-compose.yml`. PostgreSQL is already
mapped to **5433** rather than 5432 so it cannot clash with a local install.

### Stopping and resetting

```bash
docker compose down      # stop, keep the database and uploaded images
docker compose down -v   # stop and wipe all data — next start reseeds from scratch
```

### Optional configuration

Everything runs with no `.env` at all; every variable has a working default in
`docker-compose.yml`. Copy `.env.example` to `.env` only to supply real keys:

- **reCAPTCHA** — the defaults are Google's published *test* keys, which always
  pass and display a red "for testing purposes only" notice on the widget.
  Real keys from [reCAPTCHA admin](https://www.google.com/recaptcha/admin/create)
  (v2 checkbox, domain `localhost`) go in `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET`.
- **Google OAuth** — see below; it is **off** until you supply credentials.
- **Stripe** — Project 2 only.

After editing `.env`, apply it with `docker compose up -d api` (no rebuild
needed — the SPA reads this configuration at runtime from `/api/v1/auth/config`).

### Enabling Google sign-in (reviewers: read this)

`.env` is gitignored, so a fresh clone has **no OAuth credentials** and the
*Continue with Google* button is hidden — `/api/v1/auth/config` reports
`googleEnabled: false`. The authorization-code flow is fully implemented in
`backend/src/modules/auth/auth.service.js`; it simply needs credentials, which
cannot be committed to a public repository.

To see it working, create your own in about five minutes:

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services**
2. **OAuth consent screen**: External, any app name, your email as support and
   developer contact. Add your own Google address under **Audience → Test users**
   (the app stays in Testing mode, where only listed accounts may sign in).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorised redirect URI, exactly:
   ```
   https://localhost/api/v1/auth/google/callback
   ```
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then `docker compose up -d api`.

`curl -k https://localhost/api/v1/auth/config` should then report
`googleEnabled: true` and the button appears on `/login`.

### Enabling payments (reviewers: read this)

Like OAuth, Stripe credentials cannot be committed, so a fresh clone has none
and checkout stops politely at the payment step. To exercise payments:

1. Create a free account at [stripe.com](https://dashboard.stripe.com) and make
   sure you are in a **sandbox / test mode** — never live.
2. Copy both keys from **Developers → API keys** into `.env`:
   ```
   STRIPE_PUBLIC_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   ```
3. Install the CLI and log in, then start forwarding webhooks. Leave this
   running in its own terminal:
   ```bash
   brew install stripe/stripe-cli/stripe && stripe login
   stripe listen \
     --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled \
     --forward-to localhost:3000/api/v1/payments/webhook
   ```
4. It prints `whsec_…`. Put that in `.env` as `STRIPE_WEBHOOK_SECRET`.
5. Apply all three with `docker compose up -d api` — **`up -d`, not `start` or
   `restart`**, because only `up` re-reads `.env`.

### 💳 Test cards — what to type at checkout

**No real card is ever needed.** At `https://localhost/checkout`, fill the
payment form like this:

| Field | What to enter |
|---|---|
| **Card number** | one of the numbers in the table below |
| **Expiry date** | **any date in the future** — e.g. `12 / 30` |
| **Security code (CVC)** | **any 3 digits** — e.g. `123` |
| **Country** | anything; it does not affect the result |

So the quickest successful payment is:

```
Card number   4242 4242 4242 4242
Expiry        12 / 30
CVC           123
```

Only the **card number** decides what happens. Expiry and CVC are never
checked against anything in test mode — the "expired card" and "incorrect CVC"
results below come from their own card numbers, not from typing a past date or
a wrong code.

| Scenario | Card number | What you see |
|---|---|---|
| **Success** | `4242 4242 4242 4242` | Order `paid`, confirmation email |
| **Insufficient funds** | `4000 0000 0000 9995` | *"Your card was declined for insufficient funds. Try another card."* |
| **Invalid card number** | `4242 4242 4242 4241` | Rejected by Stripe's field **before submission** — fails the Luhn checksum, so no payment is attempted |
| **Expired card** | `4000 0000 0000 0069` | *"That card has expired. Please use a different card."* |
| **Gateway error / timeout** | `4000 0000 0000 0119` | *"The payment provider had a problem processing your card. Please try again in a moment."* |
| Incorrect CVC | `4000 0000 0000 0127` | *"The security code (CVC) is incorrect."* |

Every failure returns the reserved stock to the catalog and leaves the order
`payment_failed`, so they can be tried in any order.

Two honest notes about what the sandbox can and cannot do:

- **Invalid card number is caught client-side**, not by a decline. Stripe's
  field runs the Luhn checksum as you type, so a bad number never reaches the
  network. That is the correct behaviour — the server handles the decline code
  `incorrect_number` too, but Stripe will not normally let one through.
- **There is no true "timeout" test card.** `4000 0000 0000 0119` produces
  Stripe's `processing_error`, the gateway-side failure, which is the closest
  the sandbox offers. The handler also maps `api_connection_error` and
  `api_error`, and a genuine network failure (stop the API container mid-pay)
  shows *"We could not reach the payment service. Check your connection and
  retry."*

Watch the whole chain as it happens: the `stripe listen` terminal shows the
event and a `200`, `docker compose logs -f worker` shows the order transition,
and the resulting email appears at http://localhost:8025.

**If `stripe listen` stops**, its OAuth token has expired — run `stripe login`
again and restart it. Any payment made while it was down is **not lost**:
opening the order page asks Stripe directly what happened and feeds the answer
through the same queue, so the order heals itself. The log line to look for is
`[reconcile] order … -> succeeded from Stripe`.

### Demo accounts

| Email                      | Password      | Role                                              |
| -------------------------- | ------------- | ------------------------------------------------- |
| `admin@voltmarket.local`   | `Admin123!`   | admin (forced to enroll 2FA on first login)       |
| `support@voltmarket.local` | `Support123!` | support — orders, reviews and the support inbox   |
| `sales@voltmarket.local`   | `Sales123!`   | sales — products, categories and bulk import      |
| `demo@voltmarket.local`    | `Demo123!`    | customer (2FA off, so you can enroll it yourself) |

Sign in as `support` and then as `sales` to see role-based access in action:
the admin sidebar shows a different set of sections for each, and the API
refuses the rest regardless of what the UI offers.

## Try it in the browser

Open https://localhost and accept the self-signed certificate warning.

1. **Register** — `/register`. Leave a field empty or type a bad email to see
   client-side validation; the reCAPTCHA checkbox must be ticked before the
   form will submit (the server verifies the token independently).
2. **Verify tokens are memory-only** — log in, then open DevTools →
   Application. `localStorage` and `sessionStorage` are **empty**, and
   `document.cookie` shows nothing (the refresh cookie is `httpOnly`). Press
   F5: you stay logged in, because the SPA silently exchanges that cookie for a
   new access token on load.
3. **Enroll 2FA** — `/account` → _Set up 2FA_. Scan the QR with Google
   Authenticator or Authy, enter the 6-digit code, and save the 8 recovery
   codes (shown once). Log out and back in: the login form grows a second step.
   A recovery code works in place of the app code, exactly once.
4. **Reset a password** — `/forgot-password`, then read the email at
   http://localhost:8025 and follow its link. Using the same link twice fails:
   reset tokens are single-use and expire after an hour.
5. **Shop as a guest** — add items from `/cart`'s recommendations, change
   quantities, then `/checkout`. Submit the form empty first to see per-field
   validation. Place the order and pay with `4242 4242 4242 4242`.
6. **Watch the cart follow you into your account** — fill a cart while logged
   out, then log in. The guest cart merges into your account cart and
   quantities are summed, capped at available stock.
7. **Cancel an order** — from `/orders/<reference>` while it is still
   `pending_payment` or `paid`. The reserved stock returns to the catalog
   immediately; cancelling twice is refused.

## Usage guide (API)

```bash
# Browse with faceted search: category + brand + price range, sorted by price
curl -k 'https://localhost/api/v1/products?category=electric-cars&brand=tesla&minPrice=40000&maxPrice=55000&sort=price_asc'

# Live search suggestions (typo tolerant)
curl -k 'https://localhost/api/v1/products/suggest?q=tesle'

# Product detail (metric + imperial, images, related products)
curl -k 'https://localhost/api/v1/products/tesla-model-3-long-range'

# Register (CAPTCHA verified server-side; test keys accept any token)
curl -k -X POST https://localhost/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Passw0rd1","name":"Your Name","captchaToken":"test"}'

# Login → the access token (15 min) is returned in JSON and kept in memory by
# the SPA; the refresh token (7 days) travels only in an httpOnly cookie.
curl -k -c jar.txt -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@voltmarket.local","password":"Demo123!"}'

# Rotate the refresh token (each one is single-use; reuse revokes the family)
curl -k -b jar.txt -c jar.txt -X POST https://localhost/api/v1/auth/refresh
```

### Shopping, checkout and orders

```bash
# Add to a guest cart — the cookie jar is the guest's identity
PRODUCT=$(curl -sk 'https://localhost/api/v1/products?brand=wallbox&perPage=1' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["items"][0]["id"])')
curl -k -c cart.txt -X POST https://localhost/api/v1/cart/items \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT\",\"quantity\":2}"

# Read it back: line items, live totals and recommendations
curl -k -b cart.txt https://localhost/api/v1/cart

# Delivery options
curl -k https://localhost/api/v1/shipping-methods

# Place the order (works for guests; logged-in users just add the bearer token)
curl -k -b cart.txt -X POST https://localhost/api/v1/checkout \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","shippingMethodId":1,
       "shippingAddress":{"recipient":"Your Name","street":"Tartu mnt 5",
       "city":"Tallinn","postalCode":"10117","country":"EE"}}'

# A guest reads their order back with reference + the email used
curl -k 'https://localhost/api/v1/orders/VM-XXXXXX?email=you@example.com'

# Order history, filterable by status and date (requires a token)
curl -k -H "Authorization: Bearer $TOKEN" \
  'https://localhost/api/v1/orders?status=paid&from=2026-10-01&to=2026-10-31'

# Cancel while the order is still unprocessed — stock returns to the catalog
curl -k -X POST https://localhost/api/v1/orders/VM-XXXXXX/cancel \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Changed my mind"}'
```

### Reviews and ratings (P3)

Anyone can read reviews; writing one needs an account. A review from someone
who actually bought the product is badged `verifiedPurchase`, which the server
decides by looking at the buyer's paid orders — the client cannot claim it.

```bash
# Read a product's reviews: sort by helpful | recent | highest | lowest.
# The response carries the rating distribution for the 5-4-3-2-1 bar chart.
curl -k 'https://localhost/api/v1/products/tesla-wall-connector-gen-3/reviews?sort=helpful'

# Write one (1-5 stars). Rate limited to 10, refilling one every 10 seconds.
curl -k -X POST https://localhost/api/v1/products/tesla-wall-connector-gen-3/reviews \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"rating":5,"title":"Installed in an hour","body":"Electrician had it on the wall and talking to the app before lunch."}'

# Edit or withdraw your own
curl -k -X PATCH https://localhost/api/v1/reviews/$REVIEW_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"rating":4}'
curl -k -X DELETE https://localhost/api/v1/reviews/$REVIEW_ID -H "Authorization: Bearer $TOKEN"

# Mark someone else's review helpful. Sending it again clears your vote —
# it is a toggle, and voting on your own review is refused.
curl -k -X POST https://localhost/api/v1/reviews/$REVIEW_ID/helpful \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"helpful":true}'
```

One review per person per product, enforced by a unique constraint rather than
a check in application code. `helpfulCount` is recomputed from the vote rows
on every change instead of being incremented, so it cannot drift from reality.
A product's average comes only from approved reviews and is recalculated
inside the same transaction that approves or rejects one.

### Admin console (P3)

Browse to **https://localhost/admin** as a staff member, or drive it over the
API. Three roles see three different consoles:

| Role | Can reach |
| --- | --- |
| `support` | dashboard, products (read), orders, refunds, review moderation, support inbox |
| `sales` | dashboard, products (write), categories, delivery options, bulk import, orders, fulfilment |
| `admin` | everything, plus users, roles and the audit log |

Every admin route is authorised server-side, so hiding a link in the UI is a
convenience and never the control. **An admin without 2FA enrolled is refused
on the whole surface**, not per route.

```bash
# Sign in as staff (the seeded admin has 2FA, so pass an OTP; support does not)
TOKEN=$(curl -sk -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"support@voltmarket.local","password":"Support123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# Dashboard figures — revenue counts collected money only, never pending
curl -k https://localhost/api/v1/admin/stats -H "Authorization: Bearer $TOKEN"

# Product CRUD. Deleting a product that appears on an order soft-deletes it,
# so order history keeps its line items.
# Prices are integer cents and category/brand are ids, not names — the
# schema is strict, so an unexpected field is a 400 rather than a silent drop.
curl -k -X POST https://localhost/api/v1/admin/products \
  -H "Authorization: Bearer $SALES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Zaptec Go","description":"Compact 22 kW home charger with built-in earth fault protection.","priceCents":64900,"stockQuantity":12,"categoryId":7,"brandId":1}'

# Bulk import, CSV or JSON. Every row is validated before anything is written:
# one bad row rejects the whole file and names the line and field.
curl -k https://localhost/api/v1/admin/products/bulk/template -H "Authorization: Bearer $TOKEN" -o template.csv
curl -k -X POST https://localhost/api/v1/admin/products/bulk \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"format\":\"csv\",\"data\":$(python3 -c 'import json,sys;print(json.dumps(open("template.csv").read()))')}"

# Delivery options: price, window, order and whether checkout offers it.
# Changes reach the storefront immediately.
curl -k https://localhost/api/v1/admin/shipping-methods -H "Authorization: Bearer $TOKEN"
curl -k -X POST https://localhost/api/v1/admin/shipping-methods \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Saturday delivery","description":"Weekend courier slot.","priceCents":1999,"etaDaysMin":2,"etaDaysMax":4,"sortOrder":5}'
# Deleting one an order used hides it instead, so that order keeps its
# delivery details; the last active option cannot be hidden or deleted at all.

# Fulfilment: pending_payment -> paid -> processing -> shipped -> delivered.
# Only the next step is accepted; skipping one is a 400.
curl -k -X PATCH https://localhost/api/v1/orders/VM-XXXXXX/fulfilment \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"shipped","trackingNumber":"EE123456789"}'

# Refund, full or partial, through Stripe
curl -k -X POST https://localhost/api/v1/orders/VM-XXXXXX/refund \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"amountCents":4999,"reason":"Damaged in transit"}'

# Moderation queue (the seed leaves two messages waiting: spam and abuse)
curl -k 'https://localhost/api/v1/admin/reviews?status=pending' -H "Authorization: Bearer $TOKEN"
curl -k -X PATCH https://localhost/api/v1/admin/reviews/$REVIEW_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"rejected","note":"Advertising link, not a product review"}'

# Users and roles (admin only). Demoting yourself, deactivating yourself or
# removing the last active admin are all refused with 409.
curl -k 'https://localhost/api/v1/admin/users?role=customer' -H "Authorization: Bearer $ADMIN_TOKEN"
curl -k -X PATCH https://localhost/api/v1/admin/users/$USER_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"support"}'

# Audit log (admin only): every staff mutation, newest first
curl -k https://localhost/api/v1/admin/audit-log -H "Authorization: Bearer $ADMIN_TOKEN"
```

Each mutation writes an audit row **inside the same transaction as the change
itself**, so the log cannot drift out of step with the data it describes.
Changing someone's role or deactivating them revokes their sessions
immediately rather than waiting for the access token to expire.

### Contact and support (P3)

```bash
# Open to guests, so it carries its own tight bucket: 5 messages,
# refilling one every 5 minutes, independent of the global limiter.
curl -k -X POST https://localhost/api/v1/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Kati Karu","email":"kati@example.com","topic":"order","subject":"Where is my wallbox?","message":"Tracking has not moved since Tuesday and nobody has been in touch.","orderReference":"VM-XXXXXX"}'

# Staff read the inbox and work it: new -> in_progress -> closed
curl -k 'https://localhost/api/v1/admin/contact-messages?status=new' -H "Authorization: Bearer $TOKEN"
curl -k -X PATCH https://localhost/api/v1/admin/contact-messages/$MESSAGE_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}'
```

The message is written to the database **before** the notification email is
attempted. A dead mail server therefore delays a reply rather than losing a
customer's question. Sender address and message body are AES-256-GCM
encrypted at rest, because a support message routinely contains more personal
data than the form asked for. Outgoing mail lands in Mailpit at
http://localhost:8025.

### Why overselling cannot happen

Checkout runs as one transaction that locks the product rows it is about to
decrement:

```sql
SELECT * FROM products WHERE id IN (…) ORDER BY id FOR UPDATE;
```

Postgres defaults to READ COMMITTED, where two shoppers can both read "1 in
stock" and both proceed. The row lock serialises them — the second transaction
waits for the first to commit, then re-reads the real number and fails
validation. Locks are taken in id order so two orders containing the same
products in different sequences cannot deadlock. Stock is reserved at
placement rather than at payment, so reaching the payment step guarantees the
item is yours; failures and cancellations release it.

Proven by `tests/integration/checkout.test.js` → *"two concurrent checkouts
cannot oversell the last unit"*.

### Token model (review talking points)

- **JWT** = `header.payload.signature` (HS256). Payload carries `sub`, `role`,
  `jti`, `iat`, `exp`, `iss`.
- **Access token**: 15 min, held in SPA memory only (never local/session
  storage). Revocable via a Redis `jti` denylist (TTL = remaining lifetime).
- **Refresh token**: opaque 96-hex random value, 7 days, httpOnly
  `SameSite=Strict` cookie scoped to `/api/v1/auth`, stored **sha256-hashed**
  with a `family_id`. Every refresh rotates it; a reused token is treated as
  theft and the whole family is revoked.

## Testing

188 tests: unit, API integration and security. With the stack already running
(`docker compose up -d`), run them **without installing Node**:

Use `npm test` rather than calling `jest` directly: the script adds
`--runInBand` (the integration suites share one database and race if run in
parallel) and `--forceExit`. Without the latter an ioredis socket keeps the
process alive and the command appears to hang after reporting that every test
passed.

```bash
docker run --rm -v "$PWD/backend":/app -w /app \
  --network i-love-shopping_default \
  -e NODE_ENV=test \
  -e ADMIN_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop \
  -e TEST_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop_test \
  -e REDIS_URL=redis://redis:6379 \
  node:24-alpine sh -c "npm ci && npm test"
```

The suite creates and migrates its own `shop_test` database, so it never
touches development data. If you do have Node 20+ locally, the shorter form
works too:

```bash
cd backend && npm install && npm test
```

- **Unit**: JWT generation/validation/expiry/tampering, input validation
  (syntactic, semantic, whitelisting), product data model (metric+imperial).
- **API integration**: auth lifecycle incl. rotation single-use + family
  revocation, catalog browsing/facets/sorting/search, DB constraints.
- **Security**: SQL-injection & XSS payloads, malformed JSON, absurd
  pagination, helmet headers, token-bucket rate limiting (429 + Retry-After).

**Manual test checklist** (run periodically; automated bots can't cover these):

1. **CAPTCHA** — on `/register`, submit without ticking the box (blocked
   client-side), then tick it and register. With real keys, also let the widget
   expire to confirm the token is refused server-side.
2. **Google OAuth** — set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, then use
   _Continue with Google_ on `/login`: full round trip, account linking to an
   existing email, and cancelling mid-flow.
3. **2FA** — enroll via QR on `/account` in Google Authenticator or Authy, log
   in with a code, spend a recovery code (works exactly once), and confirm an
   admin account cannot disable it.
4. **Encryption** — confirm HTTPS in the browser, then check the database:

   ```bash
   docker exec -it i-love-shopping-postgres-1 \
     psql -U shop -d shop -c "SELECT email, phone_enc, totp_secret_enc FROM users;"
   ```

   Both columns are AES-256-GCM ciphertext (`iv.tag.ciphertext`), never
   readable plaintext.

## Repository layout

```
backend/     Express API — src/modules/{auth,catalog,...}, migrations/, seeds/, tests/
frontend/    React SPA (Vite + Tailwind)
nginx/       TLS termination + static serving + API proxy (self-signed cert)
load-tests/  k6 scenarios, run profiles and the method behind the report above
docs/        ERD and design notes
ANSWERS.md    Project 2 criteria answered, with commands that prove each
ANSWERS-P1.md Project 1 criteria, from the earlier submission
CHECKLIST.md progress tracker across all three projects
```

## Documentation

| Document       | Contents                                                   |
| -------------- | ---------------------------------------------------------- |
| `README.md`    | overview, setup, usage, testing (this file)                |
| `docs/erd.md`  | full entity relationship diagram with design notes         |
| `load-tests/README.md` | how the k6 suite is built and how to run it        |
| `ANSWERS.md`   | each review criterion answered, with verification commands |
| `CHECKLIST.md` | what is done and what is still planned, per project        |

## Bonus functionality beyond the minimum

- Refresh-token **family theft detection** (reuse revokes the whole chain)
- Field-level **AES-256-GCM encryption** of PII at rest + hashed tokens
- **Generated columns** for imperial units and the search tsvector (can't drift)
- Typo-tolerant suggestions via **pg_trgm** similarity
- Facet counts that ignore their own dimension (proper faceted UX)
- Redis read-through caching + fail-open token-bucket rate limiter
- Admin 2FA enforcement at the authorization layer
- TOTP clock-skew tolerance (±1 step, RFC 6238 §5.2) so a code typed as it
  rolls over still works
- Runtime frontend config via `GET /api/v1/auth/config` — reCAPTCHA keys and
  OAuth availability change without rebuilding the SPA (twelve-factor)
- De-duplicated silent token refresh: concurrent 401s trigger one refresh, so
  parallel requests never look like refresh-token theft
