# Voltmarket — Project 3 (Experience) Assessment Answers

**This submission is Project 3 (Experience)** — reviews and ratings, the admin
console, every customer-facing page, security, SEO, accessibility and load
testing. Everything below answers the Project 3 review criteria.

Projects 1 and 2 were submitted and reviewed earlier. Where an item here rests
on that work, the answer says so and links to
[ANSWERS-P1.md](ANSWERS-P1.md) or [ANSWERS-P2.md](ANSWERS-P2.md) rather than
repeating it.

Every command below was run against the running stack. Start it with
`docker compose up --build`; `-k` tells curl to accept the self-signed
certificate.

---

## Reviews and ratings

## 1. A star ratings system is implemented and users can leave text reviews

Ratings are integers 1–5, enforced by a database CHECK constraint rather than
only in application code, so no code path can write a 4.5 or a 0.

```bash
curl -k -X POST https://localhost/api/v1/products/tesla-wall-connector-gen-3/reviews \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"rating":5,"title":"Installed in an hour","body":"Electrician had it on the wall and talking to the app before lunch."}'
```

The storefront renders the picker as radio inputs with the stars drawn on top
(`frontend/src/components/reviews/Stars.jsx`), so it is keyboard-navigable with
arrow keys and announces as "3 stars" rather than as five unlabelled icons.

One review per person per product is a unique constraint on
`(product_id, user_id)` — a second attempt is rejected by the database, so
ratings cannot be stacked. A review from someone who actually bought the item
carries a `verifiedPurchase` badge, and **the server decides that** by looking
for the product in the reviewer's paid, processing, shipped or delivered
orders. The client cannot claim it.

## 2. The average rating for each product is displayed, based on user feedback

```bash
curl -k https://localhost/api/v1/products/tesla-wall-connector-gen-3 \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["product"]["rating"])'
# {'average': 5, 'count': 2}
```

The listing endpoint returns the same pair for every card, and the product page
also gets the distribution behind the 5-4-3-2-1 bars:

```bash
curl -k https://localhost/api/v1/products/tesla-wall-connector-gen-3/reviews \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["summary"])'
# {'average': 5, 'count': 2, 'distribution': {'1': 0, '2': 0, '3': 0, '4': 0, '5': 2}}
```

Two deliberate choices worth asking about:

- **The average is derived, never stored as a running total.**
  `recomputeRating()` recalculates from the approved rows and runs *inside the
  caller's transaction*, so moderating a review and updating the product's
  rating either both commit or neither does. A counter incremented on write
  would drift the first time a moderation was rolled back.
- **Only approved reviews count.** Rejecting a spam review removes it from the
  average in the same transaction that rejects it.

Migration `006_reviews.js` also zeroes the `rating_avg`/`rating_count` columns
the earlier seed had filled with invented numbers, so every rating on the site
now comes from a real review row.

## 3. A "helpful" voting feature lets users rate the usefulness of other reviews

```bash
curl -k -X POST https://localhost/api/v1/reviews/$REVIEW_ID/helpful \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"helpful":true}'
```

`review_votes` is unique on `(review_id, user_id)`, so a vote is a toggle:
sending it again clears it. Voting on your own review is refused.

`helpful_count` is **recomputed from the vote rows** on every change rather
than incremented. That matters — the seed originally wrote plausible-looking
counts with no vote rows behind them, and the first real vote collapsed a
review from 4 helpful to 1. Counting rows cannot drift from reality; a counter
can.

---

## Admin functionality

## 4. Admins can add, edit, delete, update and manage products, categories, orders and refunds

Ten screens at **https://localhost/admin**, each also reachable over the API.
They are lazy-loaded as separate bundles, so a customer never downloads the
admin console.

| Area | Operations |
| --- | --- |
| Products | create, edit, delete (soft when an order references it), search, filter |
| Categories | create, edit, delete, parent/child nesting, sort order |
| Delivery options | create, edit, hide from checkout, delete when unused |
| Orders | list, filter by status, detail with timeline, fulfilment, refunds |
| Reviews | approve, reject with a note, delete |
| Users | role changes, activate/deactivate |
| Support | contact inbox, new → in progress → closed |

```bash
# Prices are integer cents and category/brand are ids. The schema is strict,
# so an unexpected field is a 400 rather than a silently dropped value.
curl -k -X POST https://localhost/api/v1/admin/products \
  -H "Authorization: Bearer $SALES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Zaptec Go","description":"Compact 22 kW home charger with built-in earth fault protection.","priceCents":64900,"stockQuantity":12,"categoryId":7,"brandId":1}'

# Refund, full or partial, through Stripe
curl -k -X POST https://localhost/api/v1/orders/VM-XXXXXX/refund \
  -H "Authorization: Bearer $SUPPORT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"amountCents":4999,"reason":"Damaged in transit"}'
```

**Deleting a product that appears on an order soft-deletes it** rather than
removing the row, so order history keeps its line items. A category still
holding products or child categories refuses to delete rather than orphaning
them. The refund path and its over-refund protection were built and verified in
Project 2 — see [ANSWERS-P2.md](ANSWERS-P2.md) items 26–28.

## 5. Shipping statuses can be updated manually and delivery options managed

```bash
curl -k -X PATCH https://localhost/api/v1/orders/VM-XXXXXX/fulfilment \
  -H "Authorization: Bearer $SALES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"shipped","trackingNumber":"EE123456789"}'
```

Transitions are whitelisted — `paid → processing → shipped → delivered` — and
the UI offers only the next legal step, mirroring a server-side table that
refuses anything else. Skipping a step is a 400, not a silent jump. Tracking
numbers are validated to letters, digits, spaces and dashes.

Delivery options have their own screen at **`/admin/shipping`**, reachable by
`admin` and `sales`:

```bash
curl -k -X POST https://localhost/api/v1/admin/shipping-methods \
  -H "Authorization: Bearer $SALES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Saturday delivery","description":"Weekend courier slot.","priceCents":1999,"etaDaysMin":2,"etaDaysMax":4,"sortOrder":5}'
# 201 — the machine-readable code is derived from the name: "saturday_delivery"
```

Price, description, delivery window, sort order and whether the option is
offered at checkout are all editable, and a change reaches the storefront
immediately. Three rules protect checkout, which cannot function without at
least one option:

- **A window that ends before it starts is refused** (`etaDaysMax < etaDaysMin`),
  including when a *partial* update would produce one once merged with the
  stored values — the request-level schema cannot see that, so the service
  re-checks.
- **An option an order has used is hidden, never deleted**, so that order keeps
  saying how it shipped. The response says which happened:
  `{"deleted":false,"deactivated":true,"orderCount":1}`.
- **The last active option cannot be hidden or deleted** — 409, because an
  empty list would break checkout for everyone with no error that explained
  why.

Covered by `tests/integration/shipping-admin.test.js` — 14 tests including all
three rules and the role matrix (support reads, sales writes, only admin
deletes).

## 6. User accounts can be viewed and managed, including roles and permissions

```bash
curl -k 'https://localhost/api/v1/admin/users?role=customer' -H "Authorization: Bearer $ADMIN_TOKEN"
curl -k -X PATCH https://localhost/api/v1/admin/users/$USER_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"support"}'
```

Four roles: `customer`, `support`, `sales`, `admin`. Three guards stop an
administrator locking everyone out, including themselves:

```bash
# changing your own role
curl -k -X PATCH https://localhost/api/v1/admin/users/$MY_OWN_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"customer"}'
# 409 {"error":"You cannot change your own role"}
```

The same applies to deactivating your own account, and to removing the last
active admin. A role change or deactivation **revokes that user's sessions
immediately** rather than waiting up to fifteen minutes for their access token
to expire.

## 7. Bulk uploads of product data (JSON/CSV) are supported

```bash
# A template so an importer knows the exact column names
curl -k https://localhost/api/v1/admin/products/bulk/template \
  -H "Authorization: Bearer $SALES_TOKEN" -o template.csv

curl -k -X POST https://localhost/api/v1/admin/products/bulk \
  -H "Authorization: Bearer $SALES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"format":"csv","data":"name,description,...\n..."}'
```

Both CSV and JSON. **Every row is validated before anything is written**, and
one bad row rejects the whole file naming the line and the field:

```bash
# a file whose second row names a category that does not exist
# {"error":"3 row(s) could not be imported — nothing was changed",
#  "details":[{"line":3,"field":"category","message":"Unknown category \"no-such-category\""},
#             {"line":2,"field":"brand","message":"Unknown brand \"Zaptec\""}]}

# and nothing from the good row was written either:
curl -k 'https://localhost/api/v1/admin/products?q=Good%20Charger' -H "Authorization: Bearer $SALES_TOKEN"
# {"total":0,...}
```

All-or-nothing is the deliberate choice: a half-applied price list is worse
than a rejected one, because the operator cannot tell which half took effect.
Rows upsert by slug, so re-uploading a corrected file updates rather than
duplicates. Capped at 500 rows per request.

## 8. Review moderation is included

```bash
curl -k 'https://localhost/api/v1/admin/reviews?status=pending' -H "Authorization: Bearer $SUPPORT_TOKEN"
# {"total":2,...}  — the seed leaves one spam and one abusive review waiting

curl -k -X PATCH https://localhost/api/v1/admin/reviews/$REVIEW_ID \
  -H "Authorization: Bearer $SUPPORT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"rejected","note":"Advertising link, not a product review"}'
```

The response carries the product's recomputed rating, because moderating a
review and recalculating the average happen in one transaction. The rejection
note is optional and is written to the audit log. The seeded queue uses
dedicated accounts (`spam.bot@`, `angry.customer@`) so the moderation demo
always has something in it.

## 9. These features are intuitive yet secure, with role-based access control

Authorisation is enforced on **every** admin route server-side. The console
hiding a link is a convenience, never the control. Verified on a fresh install:

| Endpoint | admin | support | sales | customer |
| --- | --- | --- | --- | --- |
| `/admin/stats` | 403¹ | 200 | 200 | 403 |
| `/admin/categories` | 403¹ | 200 | 200 | 403 |
| `/admin/contact-messages` | 403¹ | 200 | 200 | 403 |
| `/admin/users` | 403¹ | 403 | 403 | 403 |
| `/admin/audit-log` | 403¹ | 403 | 403 | 403 |

¹ A freshly seeded admin has not enrolled 2FA yet — see the next item. After
enrolling, the admin row is 200 throughout.

Least privilege in practice: `support` handles customers (orders, refunds,
moderation, the inbox) but cannot edit the catalogue; `sales` manages the
catalogue but cannot read the audit log or change roles; only `admin` touches
users and the log.

**Audit logging.** Every staff mutation writes an `audit_logs` row **inside the
same transaction as the change itself**, so the log cannot drift out of step
with the data it describes:

```bash
curl -k https://localhost/api/v1/admin/audit-log -H "Authorization: Bearer $ADMIN_TOKEN"
# {"action":"review.rejected","entity":"reviews","actor":{"name":"Site Admin",...},
#  "meta":{"from":"pending","to":"rejected","note":"Advertising link, not a product review"}}
```

## 10. All admins must have 2FA enabled

`authorize()` refuses any `admin` whose `totp_enabled` is false, across the
whole admin surface rather than route by route — so the rule cannot be missed
when a new endpoint is added. The console detects the same condition and sends
the user to enrol instead of letting them hit errors screen by screen.

Admins also cannot *disable* their own 2FA once enrolled; the account page
offers that only to non-admin roles. TOTP accepts a ±1 step window (RFC 6238
§5.2) so a code typed as it rolls over still works — covered by five unit tests
in `tests/unit/totp.test.js`.

---

## User interface

## 11. Every page the brief lists is implemented

| Page | Route | Notes |
| --- | --- | --- |
| Home | `/` | featured products and categories |
| Product listing (PLP) | `/products` | faceted search, filters, grid/list toggle, pagination |
| Product detail (PDP) | `/products/:slug` | images, specs, reviews, related products |
| Shopping cart | `/cart` | thumbnails, quantity updates, removal, totals |
| Checkout | `/checkout` | single page; address, shipping, payment; guest or signed-in |
| Order confirmation | `/orders/:reference` | summary, ETA, order id and reference |
| User account | `/account` | profile, **order history**, **addresses**, security |
| Search results | `/products?q=` | result count, filtering, sorting, pagination |
| Admin | `/admin` | CRUD, orders, users, moderation, bulk upload |
| Contact/Support | `/contact` | working form, not a mailto link |
| About | `/about` | mission, values, team, company details |
| 404 | any unmatched | friendly, with a route back |
| Terms & privacy *(optional)* | `/terms` | describes what the code actually does |
| FAQ *(optional)* | `/faq` | 18 questions in five groups |

Both optional pages are included.

## 12. Quick shopping cart preview and quick search with suggestions, on every page

Both live in the header, so they are present on every route.

**Cart preview** (`components/layout/CartPreview.jsx`) is a disclosure button,
not a hover menu — hover menus are unusable on touch and unreachable by
keyboard. It closes on Escape and returns focus to the button, shows
thumbnails, quantities, line totals and a subtotal, and allows removal
in place.

**Quick search** (`components/layout/QuickSearch.jsx`) queries
`/products/suggest` as you type. Suggestions are typo-tolerant via a `pg_trgm`
GIN index, so `tesle` still finds Tesla.

## 12a. Product images are stored and served in multiple sizes

Each product has two assets, not one file rendered at different widths:

| Variant | Size | Bytes | Used by |
| --- | --- | --- | --- |
| Full | 740 × 420 | ~480 B | product detail page |
| Thumbnail | 240 × 140 | ~220 B | cards, cart lines, order history, search suggestions |

`product_images` stores both paths and both sets of intrinsic dimensions, so
the API can hand each view what it needs:

```bash
curl -k https://localhost/api/v1/products/tesla-wall-connector-gen-3 \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["product"]["images"][0])'
# url: .../tesla-wall-connector-gen-3.svg        width 740  height 420
# thumbUrl: .../tesla-wall-connector-gen-3-thumb.svg  thumbWidth 240  thumbHeight 140
```

Two different mechanisms, chosen per view:

- **Server-side, unconditional** where the rendered size is small and fixed —
  cart lines, order history and search suggestions select the thumbnail path
  in SQL. A suggestion dropdown rendering at 40px never fetches a full-size
  asset.
- **Client-side via `srcset`/`sizes`** on listing cards, where the slot width
  depends on viewport and the display may be high-density. The browser picks:
  the thumbnail on a 1× display, the full-size file on a 2× one. Both cards
  and the detail image declare `width`/`height` so the browser reserves space
  instead of reflowing when the image lands.

The thumbnail is a genuinely separate asset — it omits the product name and
brand text that would be illegible at card size — so it is less than half the
bytes rather than the same file with a smaller attribute.

Covered by `tests/integration/images.test.js`, which asserts both paths exist
on every row, that the thumbnail is the smaller of the two, that suggestions
and cart lines use it, and that every image has descriptive alt text of more
than two words.

## 13. The UI is responsive and works on mobile

Tailwind breakpoints throughout, verified at the four widths the review names
— **320, 768, 1024 and 1440 px** — plus 375 px and 640 px, the latter being
the 200% zoom equivalent. Thirteen routes checked for horizontal overflow at
320 px: none. Wide admin tables scroll inside their own container rather than
making the page scroll sideways.

320 px found two real failures, both fixed. The listing toolbar put the sort
control, the grid/list toggle and the Filters button on one non-wrapping row,
overflowing by 39 px. And the admin console's section nav, a CSS grid item,
kept its default `min-width: auto`, so instead of the nav strip scrolling
inside itself the whole page scrolled sideways by 580 px.

---

## Security

## 14. A self-signed TLS certificate secures connections

Generated at image build time and served by nginx; the whole site, API
included, is HTTPS only, with HTTP permanently redirected. See
[ANSWERS-P1.md](ANSWERS-P1.md) for the certificate generation detail. The
browser warning is expected and the README explains it.

## 15. Sensitive data is encrypted in transit and at rest

| Data | At rest |
| --- | --- |
| Passwords | bcrypt, work factor 10 — not encryption, and not reversible |
| Order email and shipping address | AES-256-GCM, plus an HMAC blind index so a guest can still look up their order |
| Saved addresses (recipient, street, phone) | AES-256-GCM |
| Phone numbers, TOTP secrets | AES-256-GCM |
| **Contact messages (sender email, body)** | AES-256-GCM — new in Project 3 |
| Refresh tokens, recovery codes | sha256 hashes, never the value |
| Card data | never stored, never received — Stripe's hosted fields |

Support messages are encrypted because one routinely contains more personal
data than the form asked for ("my order went to the wrong street"). Proven by
`tests/integration/contact.test.js`, which asserts the raw column does **not**
contain the plaintext and that it decrypts back to exactly what was sent.

## 16. Token bucket rate limiting is implemented

A Redis-backed token bucket evaluated by a Lua script, so check-and-decrement
is atomic. Buckets are per user id when authenticated, per IP otherwise:

| Bucket | Capacity | Refill |
| --- | --- | --- |
| global | 120 | 2/s |
| auth (login, register, reset) | 10 | 1 per 5 s |
| review writes | 10 | 1 per 10 s |
| **contact form** | 5 | 1 per 5 min |

```bash
for i in $(seq 1 12); do
  curl -sk -o /dev/null -w '%{http_code} ' -X POST https://localhost/api/v1/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"wrong"}'
done
# 401 401 401 401 401 401 401 401 401 429 429 429
```

The contact form gets the tightest bucket because it is the only write endpoint
open to anonymous visitors — without one it is a free mail relay. The limiter
fails open: if Redis is unreachable, requests are allowed rather than the site
going down. Covered by `tests/security/security.test.js`.

## 17. Input validation: client and server, syntactic, semantic, whitelisting

**Server-side** every route body and query is parsed by a zod schema before a
handler sees it. **Client-side** mirrors those rules so mistakes surface
without a round trip — and since the account page and checkout both collect an
address, those rules live in one shared module (`frontend/src/lib/address.js`)
rather than in two copies that could drift apart from each other and from the
server.

| Kind | Example |
| --- | --- |
| Syntactic | email format, postal code charset, `VM-AB12CD` order references, tracking numbers |
| Semantic | a country we actually ship to; a review rating within 1–5; a status transition that is legal from the current one |
| Whitelisting | **every schema is `.strict()`** — an unexpected field is a 400, not a silently ignored value |

```bash
# semantic: the format is fine, the meaning is not
curl -k -X POST https://localhost/api/v1/addresses -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"Test","street":"Main 1","city":"Boston","postalCode":"02101","country":"US"}'
# 400 {"field":"country","message":"We do not ship to that country yet"}

# whitelisting: an attempt to set a field the client has no business setting
curl -k -X POST https://localhost/api/v1/contact -H 'Content-Type: application/json' \
  -d '{"name":"X","email":"x@example.com","topic":"other","subject":"Hi","message":"...","status":"closed"}'
# 400 — `status` is not in the schema
```

The database is the last line: CHECK constraints on prices and ratings, foreign
keys, and unique constraints mean an invalid state cannot be committed even if
a code path forgot to check.

## 17a. Student can explain the CIA triad and how the platform applies it

**Confidentiality** — keeping data from those who should not see it. Passwords
are bcrypt-hashed so even we cannot read them. PII (order email, addresses,
phone, TOTP secrets, support messages) is AES-256-GCM encrypted at rest. Card
numbers never reach the server. TLS protects everything in transit. Role-based
access limits what each staff member can see — `sales` cannot open the audit
log, `support` cannot change roles — and an order is readable only by its
owner or, for a guest, by someone who knows both the reference and the email.

**Integrity** — keeping data correct and unaltered. Checkout runs in one
transaction with `SELECT … FOR UPDATE` row locks, so two shoppers cannot buy
the same last unit. CHECK constraints and foreign keys mean an invalid state
cannot be committed even if a code path forgets to check. Order items snapshot
name and price, so editing the catalogue cannot rewrite history. Refresh
tokens are single-use and rotated; reusing one revokes the whole family,
because reuse means a copy is circulating. The audit log is written in the
same transaction as the change it records, so it cannot disagree with reality.
AES-GCM is itself authenticated encryption: tampered ciphertext fails to
decrypt rather than silently returning wrong plaintext.

**Availability** — keeping the service usable for legitimate users. Token
bucket rate limiting absorbs abuse, and it **fails open** — if Redis is
unreachable, requests are allowed rather than the shop going down, because an
outage is a worse failure than an unthrottled minute. Stock reservations
expire after 60 minutes so an abandoned checkout cannot hold inventory
hostage. The queue retries failed order emails and dead-letters what it cannot
deliver, instead of losing the message or blocking the request. Payment
reconciliation pulls from Stripe when a webhook is missed, so a dropped
callback does not strand an order. Load testing established the ceiling
(~1,355 req/s) and named what to fix first.

The three pull against each other, and the places where this project chose a
side are worth asking about: the rate limiter fails open (availability over
confidentiality), bcrypt's work factor is deliberately slow (confidentiality
over availability), and stock is reserved at placement rather than payment
(integrity over availability).

---

## SEO

## 18. Title tags under 60 characters with unique primary keywords

Every page sets its own via `react-helmet-async`. Verified at runtime rather
than by reading source:

| Page | Title | Length |
| --- | --- | --- |
| Home | Voltmarket — Electric Cars & EV Gear Online | 43 |
| Products | All products — Voltmarket | 25 |
| FAQ | FAQ — Shipping, Payment and Returns \| Voltmarket | 48 |
| Terms | Terms & Privacy Policy — Voltmarket | 35 |
| Contact | Contact Support — Voltmarket | 28 |

Dynamic titles truncate at 60, so a long search query cannot overflow.

## 19. Meta descriptions of 155–160 characters with natural keywords

Every indexable page carries one in the 150–160 band. The product listing
generates a distinct description for browsing, for a search, and for each
category — a single shared description across those URLs is exactly the
duplicate-meta problem the criterion is about.

Category names range from "sedans" to "charging accessories", a spread no one
sentence can absorb inside a ten-character window, so the page picks the
longest tail that still fits. All ten categories land in range.

**A defect this pass found:** `index.html` carried a static description, and
Helmet appends its own rather than adopting it — so every page was serving
*two* description tags and a crawler could pick either. The static one is gone;
there is now exactly one per page, which the runtime check above confirms.

## 20. One H1 per page, H2–H6 structured hierarchically, all tags unique

Audited across 22 routes with a script that walks the rendered DOM and reports
any page without exactly one H1 or with a skipped level. All clean.

**A defect this pass found:** the product grid went from the page H1 straight
to the H3 of a product card whenever the filter sidebar was collapsed — which
is every phone-width viewport. The results region now carries its own H2 with
the result count.

Pages that should not be indexed say so rather than competing with real ones:
cart, checkout, order pages, the account page, the 404, the whole admin console
and the password-reset page, whose URL carries a token.

---

## Accessibility (WCAG 2.1 Level A)

## 21. Semantic HTML, keyboard navigation, ARIA, contrast, alt text, responsive text

Audited across 22 routes with a checker that walks the rendered DOM for heading
order, images without `alt`, controls without an accessible name, inputs
without an associated label, missing landmarks, contrast ratios and font units.
All 22 pass.

| Criterion | How it is met |
| --- | --- |
| Semantic HTML (1.3.1) | `main`, `nav`, `header`, `footer`, `section` with `aria-labelledby`; real `ul`/`ol`; tables with `th scope` and a `caption` |
| Bypass blocks (2.4.1) | a skip link, visible on focus, that moves focus to the content |
| Keyboard (2.1.1) | every control reachable and operable; no positive `tabindex`; the FAQ disclosures and cart preview work by keyboard, and Escape returns focus to the button that opened the panel |
| ARIA | only where native HTML is not enough — `aria-expanded` on disclosures, `aria-pressed` on toggles, `aria-current` on tabs, `role="alert"` on errors |
| Contrast (1.4.3) | 4.5:1 for body text, 3:1 for large — measured, not eyeballed |
| Alt text (1.1.1) | every meaningful image described; decorative icons `aria-hidden` |
| Responsive text (1.4.4) | zero px font sizes in the built CSS; 10 distinct rem sizes; `html { font-size: 100% }`; no horizontal scroll at 200% zoom |
| Language (3.1.1) | `lang="en"`; the viewport meta does not block zoom |

**Defects this pass found and fixed:** nine contrast failures, all text on
`gray-400` measuring 2.3–2.5:1 against a 4.5:1 requirement — including the
"Remove" control in the cart preview — plus one `gray-500` on a tinted row at
4.46:1, and a missing `main` landmark in the admin console.

---

## Testing

## 22. Unit tests

**55 unit tests** covering the five areas the brief names:

| Area | File |
| --- | --- |
| Product data model | `tests/unit/product-model.test.js` |
| Cart functionality | `tests/unit/cart.test.js` |
| Order summary calculations | `tests/unit/order-summary.test.js` |
| JWT token handling | `tests/unit/jwt.test.js` |
| User input validation | `tests/unit/validation.test.js` |

Plus `totp.test.js` for the two-factor clock-skew window.

## 23. API integration tests

**111 integration tests** across eight files, covering endpoint responses, error
handling and database persistence. New in Project 3:

- `tests/integration/addresses.test.js` — the address book behind the account
  page: CRUD, default handling, and cross-account access returning **404 rather
  than 403**, so the existence of someone else's address is not disclosed.
- `tests/integration/contact.test.js` — the contact form and support inbox,
  including that the stored row does not contain the plaintext of the message.
- `tests/integration/shipping-admin.test.js` — delivery options, and the three
  rules that stop an operator breaking checkout.

## 24. Critical user flow: product search

`tests/integration/catalog.test.js` covers the search path end to end:
full-text relevance ranking, typo-tolerant suggestions (`tesle` → Tesla),
faceted filtering by category, brand and price, sorting, and pagination.

## 25. Security tests: rate limiting

`tests/security/security.test.js` — 15 tests covering the token bucket
(exhaustion, the 429, and refill over time), injection resistance, malformed
input handling, security headers and encryption at rest.

**All 181 tests, with no Node installed on the host:**

```bash
docker run --rm -v "$PWD/backend":/app -w /app \
  --network i-love-shopping_default \
  -e NODE_ENV=test \
  -e ADMIN_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop \
  -e TEST_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop_test \
  -e REDIS_URL=redis://redis:6379 \
  node:24-alpine sh -c "npm ci && npm test"
# Test Suites: 15 passed, 15 total
# Tests:       181 passed, 181 total
```

The suite truncates and reseeds the test database before each run, so a failure
is reproducible rather than an artefact of what the previous run left behind.

## 25a. Student can explain why semantic HTML matters for accessibility

A `<div>` with a click handler looks identical to a `<button>` on screen and
is useless to everyone not using a mouse and eyes. The semantic element brings
behaviour for free that has to be rebuilt — badly — otherwise:

- **A role and a name.** A screen reader announces `<button>Hide</button>` as
  "Hide, button". A styled `<div>` announces as nothing.
- **Keyboard operability.** `<button>` is focusable and fires on Enter and
  Space; a `<div>` needs `tabindex`, key handlers and matching ARIA, and most
  implementations get one of the three wrong.
- **Navigation landmarks.** Screen-reader users jump by landmark and by
  heading. `<main>`, `<nav>`, `<header>` and an ordered H1→H2→H3 give them a
  table of contents; a page of nested `<div>`s is a wall with no doors. This
  is why the admin console's missing `<main>` and the product grid's h1→h3
  jump were worth fixing even though both looked fine.
- **It degrades well.** Semantic markup still works when CSS fails, in a
  reader mode, or in a browser nobody tested.

ARIA is the fallback, not the tool: the first rule of ARIA is not to use it if
a native element will do. This project uses it only where HTML has no
equivalent — `aria-expanded` on disclosures, `aria-pressed` on toggles,
`aria-current` on tabs, `role="alert"` on errors.

## 25b. Student can explain the approach to testing, automated and manual

**Automated tests carry the rules; manual testing carries the judgement.**

The 181 automated tests cover what is expensive to re-check by hand and easy
to break silently: money arithmetic, token lifecycles, authorisation on every
admin route, encryption at rest, and the concurrency guarantee that two
shoppers cannot buy the same last unit. Those run in seconds and gate every
commit.

Manual and exploratory testing caught what the suite could not:

- The peer-review round found six real bugs, including that refunds were
  unreachable over HTTP — the service function worked and I had "verified" it
  by calling it from a script, never through a route. The lesson, applied
  since, is to exercise the HTTP surface rather than the function behind it.
- Driving the UI found the contact form failing to prefill for a signed-in
  user, because the silent token refresh resolves after the component mounts.
- Running the delivery-options rules by hand found that deleting the last
  active option emptied the list, where hiding it was correctly refused. There
  is now a test named for exactly that case.

Each of those became a regression test, so the suite grew where reality proved
it was thin rather than where coverage looked low. That is also why the test
database truncates and reseeds before every run — a failure should be
reproducible, not an artefact of what the previous run left behind.

Two tests in this suite once passed while asserting nothing (a skipped staff
fixture, a checkout step that silently returned early). Both were found by
looking at runtime, not at the green tick. A test that cannot fail is worse
than no test, because it buys false confidence.

---

## Load testing

## 26. At least three scenarios mimicking real user behaviour

Four flows in `load-tests/lib/flows.js`, mixed the way traffic mixes:

| Flow | Steps | Share |
| --- | --- | --- |
| Browse | categories → listing → 2 × (product + reviews) | 60% |
| Search | suggestions per keystroke → results → product | 20% |
| Shop | product → add to cart → cart → shipping → **checkout** | 16% |
| Account | register → login → order history | 4% |

All include 1–4 s think time, because without it a test measures how fast a
loop spins rather than how the system behaves under people.

## 27. The performance objectives

Full write-up in the README's
[performance analysis report](README.md#performance-analysis-report).
At the target load of 50 concurrent users for 3 minutes — 7,887 requests, 318
real orders placed:

| Objective | Target | Measured | |
| --- | --- | --- | --- |
| 90% of requests within | 2 s | **24.9 ms** | ✅ |
| Concurrent users, no degradation | 50 | **50** | ✅ |
| Throughput | ≥ 10 TPS | **41.5 req/s** | ✅ |
| Transactions successful | ≥ 98% | **100%** | ✅ |
| Error rate | < 5% | **0.00%** | ✅ |

## 28. What the testing identified

- **Maximum sustainable throughput: ~1,355 req/s** — the last rate with zero
  errors.
- **Normal vs peak:** the required load uses about 3% of that ceiling, roughly
  30× headroom.
- **Maximum concurrent users before responses exceed 5 s: approximately 2,200.**
  The 95th percentile first crosses five seconds at about 500 journeys/s
  (p95 4.88 s, measured), which is ~1,400–1,700 requests/s. Converting to
  users at the ~0.6 req/s an actively browsing person generates gives ~2,200.
  Stated plainly because the review asks for the number, but the derivation
  matters: with realistic think time the platform never got slow at any
  concurrency we could generate — at **400 concurrent users p95 was 5.3
  milliseconds**, and the API was under half a core. The 5-second figure is
  reachable only by removing think time and driving requests far faster than
  2,200 real people would. The load generator also shares this machine, so the
  true figure on separate hardware is higher.
- **The load that pushes CPU over 90%: ~1,355 req/s.** Memory never came close
  — 444 MiB peak against 7.65 GiB. The platform is CPU-bound, not
  memory-bound, and no run showed anything resembling a leak.
- **Bottlenecks**, in order: (1) the API is a single Node process, so it tops
  out at one core while ten sit idle — past saturation throughput *falls*
  (1,681 → 1,415 req/s) and nginx returns 502, which is refusal rather than
  slowness; (2) TLS termination is the largest CPU consumer overall (nginx
  peaked at 920%) but scales across processes; (3) bcrypt makes auth ~8× the
  cost of any other endpoint, inside the thread that is already the
  constraint; (4) Postgres is comfortable throughout at 173% and 83 MiB.

The highest-value fix is Node's cluster module or several API replicas behind
the existing nginx — no application rewrite required.

A methodological note worth raising in the review: concurrency alone never
stressed the platform, because think time rather than the server sets the pace.
Finding the ceiling needed a second kind of test that drives a fixed arrival
rate with think time off. Without it the report would have concluded "no
bottleneck found", which would have been false.

---

## Important considerations

## 29. Admin security: least privilege and audit logging

Covered in item 9: three staff roles with genuinely different reach, every
route authorised server-side, 2FA mandatory for admins across the whole
surface, and an audit row written in the same transaction as the change it
records. Sessions are revoked the moment a role changes.

## 30. Content delivery: CDN strategy

Not implemented, and deliberately so for a self-contained reviewable project —
but the groundwork is there and the load tests say what it would buy. Static
assets are content-hashed by Vite (`index-BkKru0yx.js`) so they are safe to
cache forever, and nginx serves them with long-lived cache headers while
`index.html` stays uncached. Product images are served from a single
`/uploads` path that a CDN origin could sit in front of unchanged.

The measurement that makes the case: **TLS termination was the largest CPU
consumer in the whole system**, peaking at about nine cores while the
application used one. Moving static delivery and TLS to a CDN edge would free
most of the machine for the API — which is the actual bottleneck.

## 31. Search optimisation: accuracy against response time

Two indexes doing different jobs. Full-text search uses a `GENERATED` weighted
`tsvector` (name weighted `A`, description `B`) with a GIN index, so ranking is
precomputed rather than built per query. Suggestions use a separate `pg_trgm`
GIN index on `name` for typo tolerance.

The load tests show the trade-off landed well: suggestions, the
highest-frequency endpoint because they fire per keystroke, were the **fastest**
thing measured — 1.7 ms median, 14 ms p95 at the target load.

---

## Dockerization

## 32. The project is containerised and starts with one command

```bash
docker compose up --build
```

Builds and starts Postgres, Redis, RabbitMQ, Mailpit, the API, the queue worker
and nginx. The API runs its own migrations and seeds on boot, so a fresh clone
provisions with no extra steps. Docker and the Stripe CLI are the only
prerequisites — no Node, Postgres, Redis or OpenSSL on the host, not even to
run the tests.

**Verified by cloning this repository to an empty directory and starting it
there**: 39 products, 107 reviews and 2 support messages provisioned from
scratch; storefront, API, Mailpit and RabbitMQ all responding; all four demo
accounts signing in; guest checkout placing a real order; and the 181 tests
passing via the documented Docker command.

---

## Deliverables

## 33. The README contains the required sections

| Required | Where |
| --- | --- |
| Project overview | [Project overview](README.md#project-overview) |
| Entity Relationship Diagram | [ERD](README.md#entity-relationship-diagram), full version in [docs/erd.md](docs/erd.md) |
| **Performance analysis report** | [Performance analysis report](README.md#performance-analysis-report) |
| Setup and installation | [Setup & installation](README.md#setup--installation) |
| Usage guide | [Usage guide](README.md#usage-guide-api), including Project 3's features |
| Additional/bonus functionality | [Bonus functionality](README.md#bonus-functionality-beyond-the-minimum) |

The ERD covers all 22 tables including Project 3's `reviews`, `review_votes`
and `contact_messages`, with design notes on review integrity and why support
messages are encrypted.

---

## Known gaps

Stated plainly rather than left for a reviewer to find:

1. **No CDN** (item 30). The reasoning and the supporting measurement are
   above; the asset pipeline is ready for one.
2. **The ~2,200 concurrent-user figure is derived, not measured** (item 28),
   because the load generator shares the machine under test.
