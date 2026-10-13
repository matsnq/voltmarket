# Review checklist tracker

Living self-review against the course's mandatory items. ✅ done · 🔜 planned.

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
- ✅ Automated Unit + API integration + Security tests (76 tests)
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
- ✅ Cancellation before processing, with stock release
- ✅ Stripe PaymentIntents — card data never touches the server (needs keys to demo)
- ✅ Refund workflow (full and partial) — needs Stripe keys to exercise
- ✅ Tests: cart unit, order summary unit, guest + logged-in checkout flows (113 total)
- 🔜 Single-page checkout UI and order confirmation page (Project 3)
- 🔜 Front-end card validation via Stripe Elements (Project 3)
- 🔜 Manual: encryption in transit & at rest

## Project 3 — Experience (🔜)

- 🔜 Reviews: star ratings, text, average per product, helpful votes
- 🔜 Admin: products/categories/orders/refunds CRUD, shipping statuses, user & role management, bulk JSON/CSV upload, review moderation, RBAC, audit log
- 🔜 All admins have 2FA enforced (authorization layer already enforces this)
- 🔜 All pages: Home, PLP, PDP, Cart, Checkout, Confirmation, Account, Search, Admin, Contact, About, 404 (+ FAQ, Terms)
- 🔜 Quick cart preview + quick search with suggestions on every page
- 🔜 Self-signed TLS (done at nginx), encryption at rest for PII (done), token-bucket rate limiting (done)
- 🔜 SEO: unique title/meta/H1 per page
- 🔜 WCAG 2.1 A: semantic HTML, keyboard nav, contrast, alt text, relative units
- 🔜 Load testing (k6): ≥3 scenarios + performance report in docs/
