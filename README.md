# ⚡ Voltmarket — B2C E-commerce Platform for Electric Cars

Final course task (**i-love-shopping**). Voltmarket is a Business-to-Consumer
web shop selling **electric cars and EV accessories** (chargers, cables, tires,
gear) — built API-first with a React storefront.

> ### 📍 Reviewing this? Start here
>
> **This submission is Project 2 — Commerce**: shopping cart, checkout,
> payments and order management.
>
> - Criteria answered one by one, with commands that prove each: **[ANSWERS.md](ANSWERS.md)**
> - Running it takes two things only: **Docker** and the **Stripe CLI** →
>   [Setup & installation](#setup--installation)
> - Payments need your own Stripe test keys (they cannot be committed) →
>   [Enabling payments](#enabling-payments-reviewers-read-this)
> - **No real card needed** — what to type at checkout:
>   [Test cards](#-test-cards--what-to-type-at-checkout)
>
> Project 1 (Foundation) was submitted and reviewed earlier; its answers are
> archived in [ANSWERS-P1.md](ANSWERS-P1.md) and you do not need them here.
> Project 3 (Experience) has not been submitted yet.

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
  refunds. 124 automated tests across the whole suite.
- 🔜 **Project 3 — Experience**: product listing and detail pages, reviews,
  admin dashboard, SEO, accessibility pass, load testing.

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
```

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

| Email                    | Password    | Role                                              |
| ------------------------ | ----------- | ------------------------------------------------- |
| `admin@voltmarket.local` | `Admin123!` | admin (forced to enroll 2FA on first login)       |
| `demo@voltmarket.local`  | `Demo123!`  | customer (2FA off, so you can enroll it yourself) |

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

124 tests: unit, API integration and security. With the stack already running
(`docker compose up -d`), run them **without installing Node**:

```bash
docker run --rm -v "$PWD/backend":/app -w /app \
  --network i-love-shopping_default \
  -e NODE_ENV=test \
  -e ADMIN_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop \
  -e TEST_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop_test \
  -e REDIS_URL=redis://redis:6379 \
  node:24-alpine sh -c "npm ci && npx jest --runInBand"
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
docs/        ERD, (later: performance report, API docs)
ANSWERS.md    Project 2 criteria answered, with commands that prove each
ANSWERS-P1.md Project 1 criteria, from the earlier submission
CHECKLIST.md progress tracker across all three projects
```

## Documentation

| Document       | Contents                                                   |
| -------------- | ---------------------------------------------------------- |
| `README.md`    | overview, setup, usage, testing (this file)                |
| `docs/erd.md`  | full entity relationship diagram with design notes         |
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
