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

## Project 2 — Commerce (🔜)

- 🔜 Cart: item info, add/remove/update, real-time totals
- 🔜 Guest cart + persistent logged-in cart (+ merge)
- 🔜 Related/recommended products in cart
- 🔜 Single-page checkout with prefill, shipping options, address validation
- 🔜 Order confirmation page + email
- 🔜 Stripe sandbox payments; no card data on our server; front-end card validation
- 🔜 Payment statuses Pending/Success/Failure → message queue → order service consumes
- 🔜 Order filtering (date, status), detail view, tracking
- 🔜 Cancellations before processing + refund workflow
- 🔜 RabbitMQ with dead-letter queue; inventory oversell protection
- 🔜 Tests: cart unit, order summary unit, registration + checkout flows
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
