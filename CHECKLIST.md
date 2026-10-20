# Review checklist tracker

Living self-review against the course's mandatory items. ✅ done · 🔜 planned.

**Current submission: Project 3 (Experience).** Projects 1 and 2 were
submitted and reviewed previously; their answers are archived in
`ANSWERS-P1.md` and `ANSWERS-P2.md`.

## Project 1 — Foundation

- ✅ README: overview, ERD, setup instructions, usage guide
- ✅ B2C e-commerce model (Voltmarket sells EVs/accessories to consumers)
- ✅ Email-password authentication
- ✅ OAuth authentication (Google OAuth 2.0 authorization-code flow, configured and live; credentials in gitignored `.env`)
- ✅ CAPTCHA in registration (server-side verify; Google test keys by default)
- ✅ Can explain JWT header/payload/signature (see README "Token model")
- ✅ Access tokens stored in memory (SPA context; never local/session storage)
- ✅ Refresh token rotation with single-use validation
- ✅ Old refresh tokens rejected; reuse revokes the token family
- ✅ Revocation for access (Redis jti denylist) and refresh (DB) tokens
- ✅ Password recovery via email (Mailpit; single-use, 1 h expiry)
- ✅ Optional user-enabled 2FA (TOTP + QR + recovery codes)
- ✅ Input validation client & server for auth forms (client: `frontend/src/lib/validators.js` on register/login/reset; server: zod schemas in `auth.validation.js`)
- ✅ Auth UI: register (with reCAPTCHA widget), login (with 2FA step), forgot/reset password, account page with 2FA enrollment QR + recovery codes
- ✅ Can explain DB scalability (indexes, generated columns, read replicas, caching)
- ✅ Can explain ACID (transactions in checkout/reset; CHECK/FK constraints; WAL)
- ✅ ERD with entities, attributes, relationships, PK/FK, cardinality, modality (docs/erd.md)
- ✅ Search: weighted tsvector + GIN, ts_rank relevance, pg_trgm suggestions
- ✅ Product model: id, name, description, price, stock, category, brand, images, weight/dimensions (metric + imperial)
- ✅ Categories with intuitive browsing structure (2-level tree + counts)
- ✅ Faceted search (price range, brand, category, rating, EV range, stock)
- ✅ Sorting: relevance, price, rating (+ newest)
- ✅ Product images stored as files, served via /uploads
- ✅ Automated Unit + API integration + Security tests
- ✅ Architecture explanation (modular monolith, stateless API → horizontal scale)
- ✅ Dockerized; Docker is the only host prerequisite

## Project 2 — Commerce

- ✅ Cart: name, price, thumbnail per item; add/remove/update; real-time totals
- ✅ Guest cart (httpOnly cookie token, DB-backed) + persistent cart for users
- ✅ Guest cart merges into the account cart on login (quantities summed, capped at stock)
- ✅ Related/recommended products based on what is in the cart
- ✅ Checkout API: email, address, shipping method; prefill data available via `/auth/me`
- ✅ Shipping options (4 tiers) with server-side address validation (syntactic + country whitelist)
- ✅ Order confirmation email via Mailpit, with full summary
- ✅ Payment statuses Pending/Success/Failure linked to order state
- ✅ Status published to RabbitMQ; worker consumes and updates the order
- ✅ RabbitMQ dead-letter queue + bounded retries + idempotent consumers
- ✅ Inventory: stock reserved at placement under `SELECT … FOR UPDATE`, released on
  failure/cancellation — concurrent oversell proven impossible by test
- ✅ Order filtering by date and status; detail view with status timeline
- ✅ Fulfilment: staff advance paid → processing → shipped → delivered with a
  tracking number, whitelisted transitions, audit-logged, admin 2FA enforced
- ✅ Cancellation before processing, with stock release
- ✅ Stripe PaymentIntents — card data never touches the server; verified end to end against the sandbox
- ✅ Refund workflow (full and partial), with over-refund protection — verified against Stripe
- ✅ Tests: cart unit, order summary unit, guest + logged-in checkout flows (175 tests across the whole suite)
- ✅ Single-page checkout UI, cart page and order confirmation page
- ✅ Front-end card validation via Stripe PaymentElement (number, expiry, CVC)
- ✅ Four payment failure scenarios verified: insufficient funds, expired card, incorrect CVC, processing error
- ✅ Encryption at rest for order PII (AES-256-GCM + HMAC blind index), asserted by test
- ✅ Project 2 answers documented in `ANSWERS-P2.md`

## Project 3 — Experience

- ✅ Reviews: 1–5 star ratings, text reviews, average per product recomputed
  from approved reviews only, helpful voting as a toggle backed by real vote
  rows, verified-purchase badge decided server-side
- ✅ Admin: product/category/order CRUD, refunds, shipping status transitions,
  delivery options, user and role management, bulk JSON/CSV upload, review
  moderation, support inbox — eleven screens, lazy-loaded so the storefront
  bundle is unaffected
- ✅ RBAC across three staff roles (admin / support / sales), authorised
  server-side on every route; the UI hiding a link is never the control
- ✅ Admins without 2FA are refused the entire admin surface, not per route
- ✅ Audit log: every staff mutation written in the same transaction as the
  change it describes
- ✅ All pages: Home, PLP, PDP, Cart, Checkout, Confirmation, Account, Search,
  Admin, Contact, About, 404, plus the optional FAQ and Terms
- ✅ Quick cart preview and quick search with suggestions on every page
- ✅ Self-signed TLS, AES-256-GCM encryption at rest for PII, token-bucket
  rate limiting, client + server validation (syntactic, semantic, whitelisting)
- ✅ SEO: unique title (<60 chars) and meta description (150–160) per page,
  one H1, ordered H2–H6, noindex on private pages — verified at runtime
- ✅ WCAG 2.1 A: semantic HTML, skip link, keyboard navigation, accessible
  names, 4.5:1 / 3:1 contrast, alt text, rem font sizes, 200% reflow —
  audited across 22 routes
- ✅ Load testing (k6): 4 user flows, 6 run profiles, all five objectives met;
  findings in the README's performance analysis report
- ✅ Project 3 answers documented in `ANSWERS.md`
