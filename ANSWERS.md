# Voltmarket — Project 1 (Foundation) Assessment Answers

> Project 2 (Commerce) criteria are answered in **[ANSWERS-P2.md](ANSWERS-P2.md)**.

Every mandatory review item, in the order the audit lists them. Items phrased
"the student can explain…" are answered in prose; items phrased "verify…" come
with the command that proves them.

Assumes the stack is running (`docker compose up --build`). The API is reachable
at `https://localhost/api/v1` through nginx (self-signed cert, hence `curl -k`)
and directly on `http://localhost:3000` for convenience.

---

## 1. The README file contains a clear project overview, entity relationship diagram, setup instructions, and usage guide

`README.md` has all four: an overview with the stack table and architecture
rationale, a condensed Mermaid ERD (full version in `docs/erd.md`), setup as a
single `docker compose up --build`, and a usage guide with runnable `curl`
examples plus a browser walkthrough.

## 2. The platform implements a Business-to-Consumer (B2C) e-commerce model

Voltmarket sells electric cars and EV accessories directly to individual
consumers. One seller (the shop), many private buyers — no vendor onboarding, no
business-account tier, no marketplace commission model. The catalog is split
into `Electric Cars` (sedans, SUVs, hatchbacks, vans) and
`Charging & Accessories` (home chargers, cables, tires, care products), which is
a consumer retail structure rather than a wholesale one.

## 3. The system implements both email-password and OAuth authentication methods

Both live in `backend/src/modules/auth/`:

- **Email + password** — `POST /auth/register` and `POST /auth/login`. Passwords
  are hashed with bcrypt (cost 10) in `auth.service.js`.
- **Google OAuth 2.0** — the authorization-code flow, written out by hand rather
  than using a passport strategy, so every step is visible:
  `googleAuthUrl()` builds the consent URL with a CSRF `state` stored in Redis
  for 10 minutes; `googleCallback()` validates that state, exchanges the code at
  `oauth2.googleapis.com/token`, fetches the profile from the OIDC userinfo
  endpoint, then links or creates the user and issues **our own** JWT pair.

Providers are stored in a separate `oauth_accounts` table keyed by
`(provider, provider_user_id)`, so adding Facebook later is a new row type, not
a schema change. If a Google account's email matches an existing local account,
the two are linked inside a transaction instead of creating a duplicate user.

```bash
# OAuth availability is reported to the SPA at runtime:
curl -k https://localhost/api/v1/auth/config
# {"recaptchaSiteKey":"...","googleEnabled":true}   (false until keys are set)
```

## 4. CAPTCHA is integrated into the registration process

Google reCAPTCHA v2 checkbox. The widget renders on `/register`
(`frontend/src/components/Recaptcha.jsx`) using a site key fetched at runtime
from `GET /auth/config` — so keys change without rebuilding the SPA.

The important half is server-side: `register()` calls `verifyCaptcha()`
(`backend/src/lib/recaptcha.js`) **before** touching the database, POSTing the
token to `https://www.google.com/recaptcha/api/siteverify`. Client-side
checking alone would be bypassable with a single `curl`. Verification fails
closed — if Google is unreachable, registration is refused rather than allowed.

The committed default keys are Google's published *test* keys, which always
pass, so the project runs with no setup; real keys go in `.env`.

## 5. Student can explain the concept of JWT and its components (header, payload, signature)

A JWT is three base64url-encoded strings joined by dots:
`header.payload.signature`.

- **Header** — `{"alg":"HS256","typ":"JWT"}`: which algorithm signs the token.
- **Payload** — the claims. Ours carries `sub` (user id), `role`, `name`, `jti`
  (unique token id, used for revocation), plus `iat`, `exp` and `iss` added by
  the library. This is **encoded, not encrypted** — anyone holding the token can
  read it, so it must never contain secrets.
- **Signature** — `HMAC-SHA256(header + "." + payload, secret)`. It proves the
  token was issued by us and has not been altered. Change a single byte of the
  payload and verification fails, because the recomputed HMAC no longer matches.

That is the whole value of a JWT: the server can trust the claims after one
cheap cryptographic check, with no database lookup and no session store — which
is precisely what lets the API scale horizontally.

```bash
# Decode a real token's header and payload (signature stays opaque):
TOKEN=$(curl -sk -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@voltmarket.local","password":"Demo123!"}' | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
# base64url needs its padding restored, hence the python one-liner
decode() { python3 -c 'import sys,base64,json; s=sys.stdin.read().strip(); print(json.dumps(json.loads(base64.urlsafe_b64decode(s+"="*(-len(s)%4))),indent=2))'; }
echo "$TOKEN" | cut -d. -f1 | decode    # header
echo "$TOKEN" | cut -d. -f2 | decode    # payload
echo "$TOKEN" | cut -d. -f3            # signature — opaque, not decodable
```

Expected payload:

```json
{ "sub": "4f91e695-…", "role": "customer", "name": "Demo Customer",
  "jti": "7b1e8054-…", "iat": 1789998539, "exp": 1789999439, "iss": "voltmarket" }
```

Note `exp - iat = 900` seconds — the 15-minute access-token lifetime.

Tests covering this: `backend/tests/unit/jwt.test.js` asserts the three-part
structure, the exact header, the claim set, expiry, and that both a wrong
signing secret and a tampered payload are rejected.

## 6. Access tokens are stored in memory

`accessToken` is a module-scoped variable in `frontend/src/lib/api.js` — not
`localStorage`, not `sessionStorage`, not even React state. Any script that
achieves XSS can enumerate browser storage; it cannot read a closure variable
by name.

Verify in DevTools → Application while logged in: both storages are empty, and
`document.cookie` returns `""` because the refresh cookie is `httpOnly`.

```js
// paste in the browser console while logged in
({ localStorage: localStorage.length, sessionStorage: sessionStorage.length, cookies: document.cookie })
// → { localStorage: 0, sessionStorage: 0, cookies: "" }
```

The trade-off is that a page reload loses the token. `AuthProvider`
(`frontend/src/hooks/useAuth.jsx`) covers that on mount by calling
`POST /auth/refresh`; the httpOnly cookie rides along automatically and a fresh
access token lands back in memory. So the session survives F5 without ever
persisting a token to disk.

## 7. Refresh token rotation is implemented with single-use validation

`rotateRefreshToken()` in `backend/src/modules/auth/token.service.js`:

1. Look up the presented token by its **sha256 hash** (raw tokens are never
   stored, so a database dump yields nothing usable).
2. Reject it if revoked or expired.
3. If `used_at` is already set → treat as theft (see item 8).
4. Otherwise claim it atomically:
   `UPDATE … WHERE id = ? AND used_at IS NULL`. If that update affects zero
   rows, a concurrent request won the race, which is also treated as reuse.
5. Issue a replacement token in the **same `family_id`** and return it.

Refresh tokens are opaque 48-byte random values rather than JWTs, precisely
because they must be checked against the database on every use — the opposite
trade-off from access tokens.

## 8. Verify that each refresh token can only be used once and a new refresh token is issued with each refresh; old refresh tokens must be rejected

Rotation groups tokens into a **family** (`family_id`). Reuse of a spent token
means two copies exist in the wild, so `revokeFamily()` revokes the entire
chain — the legitimate user is logged out and must re-authenticate, which is
the correct response to a stolen token.

```bash
# 1. log in — stores the refresh cookie in jar1
curl -sk -c jar1.txt -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@voltmarket.local","password":"Demo123!"}' -o /dev/null

# 2. refresh with it — succeeds, writes a DIFFERENT cookie to jar2
curl -sk -b jar1.txt -c jar2.txt -X POST https://localhost/api/v1/auth/refresh | head -c 80; echo

# 3. replay the OLD cookie — rejected as reuse
curl -sk -b jar1.txt -X POST https://localhost/api/v1/auth/refresh
# {"error":"Refresh token reuse detected — all sessions in this chain were revoked"}

# 4. the NEW cookie is now dead too, because the whole family was revoked
curl -sk -b jar2.txt -X POST https://localhost/api/v1/auth/refresh
# {"error":"Refresh token revoked"}
```

Automated equivalent: `tests/integration/auth.test.js` →
*"refresh rotates the token; the old one is single-use; reuse revokes the family"*.

## 9. Token revocation mechanism is in place for both access and refresh tokens

The two token types need different mechanisms, which is worth saying out loud:

- **Refresh tokens** are stateful — revocation sets `revoked_at` in the
  `refresh_tokens` table. `revokeRefreshToken()` kills one,
  `revokeFamily()` a rotation chain, `revokeAllForUser()` every session.
- **Access tokens** are stateless and self-validating, so they cannot be
  "deleted". Instead `revokeAccessToken()` writes the token's `jti` to a Redis
  denylist with a TTL equal to its **remaining lifetime**, and the
  `authenticate` middleware checks that denylist on every request. Once the
  token would have expired anyway, Redis drops the key on its own, so the
  denylist can never grow without bound.

`POST /auth/logout` revokes both. `POST /auth/logout-all` revokes every session
for the user. A password reset also calls `revokeAllForUser()`.

```bash
# access token dies immediately on logout
TOKEN=$(curl -sk -c j.txt -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@voltmarket.local","password":"Demo123!"}' | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
curl -sk -H "Authorization: Bearer $TOKEN" https://localhost/api/v1/auth/me -o /dev/null -w 'before logout: %{http_code}\n'
curl -sk -b j.txt -H "Authorization: Bearer $TOKEN" -X POST https://localhost/api/v1/auth/logout -o /dev/null
curl -sk -H "Authorization: Bearer $TOKEN" https://localhost/api/v1/auth/me -o /dev/null -w 'after logout:  %{http_code}\n'
# before logout: 200 / after logout: 401
```

## 10. Password recovery and reset functionality via email is implemented

`POST /auth/password/forgot` → `POST /auth/password/reset`, with the email sent
through Mailpit (a dev SMTP server with a web inbox at http://localhost:8025,
so no external mail provider is needed to review this).

Security properties, all deliberate:

- The forgot endpoint **always** returns the same 200 response whether or not
  the account exists — otherwise it becomes an account-enumeration oracle.
- The token is 48 random bytes, stored **sha256-hashed**, and expires in 1 hour.
- Redeeming it happens inside a transaction that first claims the token
  (`WHERE used_at IS NULL`) and only then writes the new password hash, so a
  crash between the two cannot leave a spent token with an unchanged password.
- A successful reset calls `revokeAllForUser()` — changing your password logs
  out every existing session, which is what a user resetting after a
  compromise expects.

Walkthrough: submit `/forgot-password` in the UI, open http://localhost:8025,
follow the link, set a new password, then try the same link again — it fails.

## 11. Two-factor authentication (2FA) is available as an optional, user-enabled feature

TOTP (RFC 6238) via `otplib`, opt-in per user from `/account`:

1. `POST /auth/2fa/setup` generates a secret, stores it **encrypted**, and
   returns a QR data-URL (`otpauth://` URI) for Google Authenticator or Authy.
2. `POST /auth/2fa/enable` requires a valid 6-digit code to prove the app is
   really enrolled, then returns **8 recovery codes shown exactly once** and
   stored only as sha256 hashes.
3. Login then requires the code: the API answers `401` with
   `details.code = "2FA_REQUIRED"`, and the UI grows a second step rather than
   sending the user back to the start.
4. A recovery code is accepted in place of an app code and is consumed on use.
5. `POST /auth/2fa/disable` needs a valid code and wipes the secret and codes.

Two details worth volunteering: codes are accepted **±1 time step**
(RFC 6238 §5.2) so a code typed as it rolls over still works — without this,
users hit spurious failures at 30-second boundaries. And **admins cannot
disable 2FA**: the `authorize` middleware refuses admin access entirely while
`totp_enabled` is false, which satisfies the Project 3 rule that all admins have
2FA on.

Demo: `/account` → *Set up 2FA* → scan → enter code → save recovery codes → log
out → log in and watch the second step appear.

## 12. User input validation is implemented on both client and server sides for authentication forms

- **Server** (the security boundary) — zod schemas in
  `backend/src/modules/auth/auth.validation.js`, applied by the `validate`
  middleware. Every schema is `.strict()`, so unexpected fields are rejected
  outright rather than ignored — that is whitelisting, and it stops a client
  from smuggling `role: "admin"` into a registration payload.
- **Client** (UX only) — `frontend/src/lib/validators.js` mirrors the same
  rules for instant feedback on blur, with errors tied to inputs via
  `aria-describedby` and announced with `role="alert"`.

The audit asks for three kinds of validation and all three are present:

| Kind | Example |
|---|---|
| Syntactic | email shape, 6-digit OTP, 96-hex reset token, password length |
| Semantic | `minPrice ≤ maxPrice`, `page ≤ 1000`, rating within 0–5 |
| Whitelisting | `.strict()` objects, `sort` as an enum, brand slugs `^[a-z0-9-]+$` |

Be explicit at review that client validation adds **no** security — anyone can
skip the browser and call the API directly. It exists so users learn about a
mistake without a round trip.

```bash
# server rejects bad input with per-field messages
curl -sk -X POST https://localhost/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"nope","password":"short","name":"X","captchaToken":"t"}'
```

## 13. Student can explain the chosen database's scalability features and how they support potential growth

PostgreSQL 16. The scaling path, in the order it would actually be applied:

1. **Indexing** — every foreign key and filter column is indexed, plus a GIN
   index on the search vector (`products_search_idx`) and a trigram index for
   suggestions (`products_name_trgm_idx`). This is the cheapest and largest win.
2. **Caching** — `backend/src/lib/cache.js` is a read-through Redis cache with
   short TTLs on catalog reads. E-commerce traffic is overwhelmingly reads, so
   absorbing them outside the database protects it during promotions.
3. **Connection pooling** — knex keeps a bounded pool (max 10 per API
   instance), so adding API containers does not open unbounded connections.
4. **Read replicas** — streaming replication lets browsing and search go to
   replicas while writes stay on the primary. The application already separates
   read paths from write paths cleanly, so this is a configuration change.
5. **Partitioning / sharding** — deliberately *not* done. Orders partitioned by
   date would help at a scale this project will not reach, and knowing when a
   technique is unnecessary matters as much as knowing the technique.

Postgres specifics I am actually relying on: generated columns, `tsvector`
full-text search with GIN, `pg_trgm` similarity, real transactional DDL, and
`jsonb` for flexible product attributes without schema churn.

## 14. Student can explain ACID properties and their importance in e-commerce database design

- **Atomicity** — all steps of an operation commit together or none do.
  `resetPassword()` (`auth.service.js:176`) wraps "claim token" + "update
  password" in `db.transaction`; `googleCallback()` wraps "create user" + "link
  oauth account". In e-commerce the canonical case is checkout: order, order
  items, stock decrement and cart clear must not half-apply, or you charge for
  goods you never reserved.
- **Consistency** — every committed state satisfies the declared rules. Here
  that is enforced by the database itself, not application code:
  `products_price_nonnegative` and `products_stock_nonnegative` CHECK
  constraints, foreign keys on every relationship, and unique constraints on
  emails and token hashes.
- **Isolation** — concurrent transactions behave as if they ran one after
  another. Postgres defaults to READ COMMITTED, which is not enough for
  check-then-act on stock, so Project 2's checkout takes `SELECT … FOR UPDATE`
  row locks on the products being purchased. Without it, two shoppers can both
  read "1 in stock" and both succeed — the classic oversell.
- **Durability** — once a commit is acknowledged, it survives a crash, because
  Postgres writes the change to the write-ahead log before confirming. A power
  cut immediately after "order placed" must not lose the order.

```bash
# constraints refuse invalid data even when the application asks for it
docker exec i-love-shopping-postgres-1 psql -U shop -d shop \
  -c "UPDATE products SET price_cents = -1 WHERE slug = 'tesla-model-3-long-range';"
# ERROR:  new row for relation "products" violates check constraint
#         "products_price_nonnegative"
```

## 15. An Entity Relationship Diagram (ERD) is provided, clearly showing entities, attributes, relationships, primary keys, foreign keys, cardinality, and modality

`docs/erd.md` — a Mermaid `erDiagram` covering all seven required elements:
every entity with its attributes and types, `PK`/`FK`/`UK` markers, labelled
relationships, and crow's-foot notation carrying both **cardinality** (one vs
many) and **modality** (optional vs mandatory).

Reading the notation, with concrete examples from the diagram:

| Notation | Meaning | Example |
|---|---|---|
| `\|\|--o{` | exactly one → zero or many | a user holds zero or many refresh tokens |
| `\|o--o{` | zero or one → zero or many | a cart *may* belong to a user (guest carts have none) |
| `\|\|--\|{` | exactly one → one or many | an order always has at least one order item |
| `\|o--o{` (self) | optional self-reference | a category may have a parent category |

The optional side is the interesting part: `users |o--o{ carts` and
`users |o--o{ orders` are what make **guest checkout** expressible in the
schema, and `categories |o--o{ categories` is what makes the category tree
arbitrarily deep. Project 2 and 3 entities are included and marked, so the
diagram is the plan for the whole platform rather than only what exists today.

## 16. Student can demonstrate and explain the search implementation including database design and basic text search functionality

**Database design.** `search_vector` is a *generated* `tsvector` column, so
Postgres maintains it — there is no trigger to forget and no way for the index
to drift from the data:

```sql
setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
setweight(to_tsvector('english', coalesce(description, '')), 'B')
```

`to_tsvector` lowercases, strips stop words and stems ("charging" → "charg").
`setweight` marks name terms `A` and description terms `B`, so a product whose
*name* matches outranks one that merely mentions the word. A GIN index
(`products_search_idx`) makes lookups fast.

**Querying.** `websearch_to_tsquery` parses human syntax (quoted phrases, `or`,
leading `-`), and `ts_rank` against the weighted vector produces the relevance
ordering used by `sort=relevance`.

**Suggestions** use a different tool on purpose: full-text search cannot match a
misspelling, because the word never stems to the right lexeme. `pg_trgm` splits
text into three-character shingles and scores set overlap, so "tesle" still
finds Tesla. That is backed by its own GIN index (`products_name_trgm_idx`).

```bash
# relevance ranking — name matches beat description matches
curl -sk 'https://localhost/api/v1/products?q=long+range+tesla' | head -c 200; echo

# typo-tolerant suggestions
curl -sk 'https://localhost/api/v1/products/suggest?q=tesle'

# the raw ranking, straight from the database
docker exec i-love-shopping-postgres-1 psql -U shop -d shop -c \
"SELECT name, ts_rank(search_vector, websearch_to_tsquery('english','long range tesla')) AS rank
 FROM products WHERE search_vector @@ websearch_to_tsquery('english','long range tesla')
 ORDER BY rank DESC LIMIT 3;"
```

## 17. The product data model includes all required fields: id, name, description, price, stock quantity, category, brand, images, and weight/dimensions (in both metric and imperial units)

All present in `migrations/002_catalog.js`. Two decisions worth defending:

**Money as integer cents.** `price_cents integer`, never a float. Binary
floating point cannot represent 0.1 exactly, so repeated float arithmetic
drifts — unacceptable for money. Formatting to a currency string happens once,
at serialization.

**Imperial units as generated columns.** Metric is canonical; imperial is
derived by Postgres and cannot be written to:

```sql
weight_lb GENERATED ALWAYS AS (round(weight_kg * 2.20462, 2)) STORED
length_in GENERATED ALWAYS AS (round(length_mm / 25.4, 1)) STORED
```

Storing both as plain columns would let them disagree after any partial update.
This way disagreement is structurally impossible — a much stronger guarantee
than "we remember to update both".

Also modelled: EV-specific attributes (`range_km`, `battery_kwh`,
`motor_power_kw`, null for accessories), `jsonb attributes` for per-category
extras without schema churn, and denormalized `rating_avg` / `rating_count` so
listing pages need no aggregate join.

```bash
curl -sk https://localhost/api/v1/products/tesla-model-3-long-range | python3 -m json.tool | head -40
```

## 18. Products are organized into categories with an intuitive browsing structure

`categories` is self-referencing (`parent_id`), giving a tree of arbitrary
depth. Two roots today: *Electric Cars* (Sedans, SUVs & Crossovers, Hatchbacks
& Compacts, Vans & Pickups) and *Charging & Accessories* (Home Chargers,
Charging Cables, Tires & Wheels, Car Care & Gear).

`GET /categories` returns the tree with **recursive product counts** — a parent
reports its own products plus every descendant's, so the count a shopper sees
matches what clicking actually shows. Filtering by a parent slug resolves to all
descendant ids (`categoryIdsForSlug()`), so browsing *Electric Cars* returns
cars from every sub-category rather than an empty page.

```bash
curl -sk https://localhost/api/v1/categories | python3 -m json.tool | head -30
curl -sk 'https://localhost/api/v1/products?category=electric-cars&perPage=60' | head -c 120; echo
```

## 19. Faceted search is implemented, allowing users to refine results by product attributes

Filters: full-text query, category (tree-aware), multiple brands, price range,
minimum rating, minimum EV range, and in-stock only — all combinable.

The part worth demonstrating is **how the facet counts are computed**. Each
facet is counted with every filter applied *except its own dimension*
(`applyFilters(..., { skip: ['brand'] })` in `catalog.service.js`). So after
selecting Tesla you still see the other brands with their counts, and can widen
the selection. Counting with the brand filter included would return only Tesla,
making the facet a dead end — this is the standard behaviour of every real
storefront, and it is a deliberate choice rather than an accident.

```bash
# brand facet still lists other brands even while filtering by Tesla
curl -sk 'https://localhost/api/v1/products?brand=tesla' | python3 -c \
'import json,sys; d=json.load(sys.stdin); print([(b["slug"],b["count"]) for b in d["facets"]["brands"]][:6])'

# filters compose
curl -sk 'https://localhost/api/v1/products?brand=tesla&minPrice=40000&maxPrice=50000&inStock=true' | head -c 120; echo
```

## 20. Product listing includes sorting options for relevance, price and rating

`sort` accepts `relevance`, `price_asc`, `price_desc`, `rating` and `newest`,
validated against an enum so an arbitrary string can never reach SQL. The
default is context-aware: `relevance` when a search query is present (ranking is
meaningless without one), otherwise `newest`. Rating sort breaks ties on
`rating_count`, so a 5.0 from three reviews does not outrank a 4.9 from two
hundred.

```bash
for s in relevance price_asc price_desc rating; do
  echo "--- $s ---"
  curl -sk "https://localhost/api/v1/products?q=charger&sort=$s&perPage=3" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); [print(" ", p["name"], p["price"]["formatted"], p["rating"]["average"]) for p in d["items"]]'
done
```

## 21. Product images are stored with proper file handling and basic serving functionality

Images are files on disk under `backend/uploads/products/`, referenced from the
`product_images` table by path — never stored as blobs in the database, which
would bloat backups and defeat HTTP caching. The table carries `alt_text`
(needed for the WCAG requirement), `sort_order` and an `is_primary` flag so
listing pages can fetch one thumbnail per product.

Serving is layered: Express exposes `/uploads` via `express.static` with a
7-day `max-age`, and nginx proxies that path with its own cache headers. The
directory is a Docker **named volume**, so images survive container rebuilds —
and the seed regenerates any missing file, so a fresh volume self-heals.

```bash
curl -skI https://localhost/uploads/products/tesla-model-3-long-range.svg | head -5
# HTTP/2 200 / content-type: image/svg+xml / cache-control: public
```

## 22. Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process

A pyramid, with each layer justified by what it can and cannot catch:

- **Unit (35 tests)** — pure logic, no I/O, millisecond feedback: JWT handling,
  TOTP windows, validation schemas, product serialization.
- **API integration (28 tests)** — real HTTP through the actual Express app via
  supertest, against a real Postgres and Redis. This is the only layer that can
  prove things like refresh-token rotation or facet counts, because they are
  properties of the whole request path plus the database, not of one function.
- **Security (13 tests)** — hostile input as a first-class concern rather than
  an afterthought.

Tests run against a **separate `shop_test` database** created and migrated by
`tests/globalSetup.js`, so they never touch development data and always start
from a known seed.

**Manual tests exist for what automation genuinely cannot reach**, which is the
honest reason to have them — not laziness:

| Manual test | Why it can't be automated |
|---|---|
| CAPTCHA | The whole point is proving a human is present |
| Google OAuth | Requires consenting on Google's own domain |
| 2FA enrollment | Needs a phone camera scanning a QR code |
| Encryption at rest/in transit | Inspecting the browser padlock and raw DB columns |

These are documented as a checklist in `README.md` so they are repeatable rather
than remembered.

## 23. Automated tests exist for Unit, API integration, and Security tests covering authentication and product catalog functionality

The Project 1 suite is 76 tests (the repository now totals 118, the rest
covering Project 2 — see [ANSWERS-P2.md](ANSWERS-P2.md)):

| File | Layer | Tests | Covers |
|---|---|---|---|
| `tests/unit/jwt.test.js` | unit | 7 | structure, claims, expiry, wrong secret, tampering, revocation |
| `tests/unit/validation.test.js` | unit | 17 | syntactic, semantic, whitelisting, both modules |
| `tests/unit/product-model.test.js` | unit | 6 | required fields, money, metric+imperial, EV specs |
| `tests/unit/totp.test.js` | unit | 5 | clock-skew window boundaries |
| `tests/integration/auth.test.js` | integration | 13 | register, login, rotation, revocation, reset, 2FA |
| `tests/integration/catalog.test.js` | integration | 15 | browsing, facets, sorting, search, DB constraints |
| `tests/security/security.test.js` | security | 13 | SQLi, XSS, malformed input, headers, rate limiting |

(35 unit + 28 integration + 13 security = 76. Several files use `test.each`, so
one block in the source produces multiple test cases.)

```bash
docker compose up -d postgres redis
cd backend && npm test
```

## 24. Ask the student to explain and demonstrate the functionality of the tests

Run selectively and talk through what each layer proves:

```bash
cd backend
npm run test:unit         # fast, no I/O
npm run test:integration  # real HTTP + real Postgres/Redis
npm run test:security     # hostile input
npx jest --verbose tests/integration/auth.test.js   # read the test names aloud
```

Three worth walking through specifically:

- **`jwt.test.js` → "rejects a tampered payload"** decodes a real token, flips
  `role` to `admin`, re-encodes it and asserts verification fails. This is the
  signature doing its job, demonstrated rather than asserted.
- **`auth.test.js` → "refresh rotates the token; the old one is single-use;
  reuse revokes the family"** is the single most important test in the suite:
  it captures the rotating cookies and proves all three properties in sequence.
- **`security.test.js`** feeds `'; DROP TABLE products; --` into search and then
  asserts the products table still has rows. Two layers make it safe: zod
  whitelisting, and knex parameterization, which sends the payload as a *value*
  so it can never be parsed as SQL.

One design note reviewers tend to probe: tests set `NODE_ENV=test`, which makes
the CAPTCHA and mailer short-circuit deterministically (grep for `env === 'test'`
to see exactly where). Without those seams, the suite would depend on Google
being reachable.

## 25. Student can explain their chosen architectural approach and justify how it aligns with their platform's scalability requirements

A **modular monolith**: one deployable Express application, internally divided
into modules under `backend/src/modules/` (`auth`, `catalog`, and in later
projects `cart`, `orders`, `payments`, `reviews`, `admin`), each with its own
routes, controller, service and validation, and no reaching into another
module's internals.

**Why not microservices.** They would buy independent deployability at the cost
of network failure modes between every call, distributed transactions where a
single database transaction does today, and per-service operational overhead —
for a platform serving one shop. That is complexity without a matching problem.

**How the scalability requirement is actually met.** The API is **stateless** —
all state lives in Postgres (durable), Redis (cache, rate-limit buckets, JWT
denylist) or the client's own JWT. So scaling out is running more API
containers behind nginx; no sticky sessions, no shared filesystem for session
data. Slow work is already decoupled: RabbitMQ plus a separate `worker` process
built from the same image handles order and email processing, which is exactly
the seam along which a service would be extracted first if it ever needed to be.

The design follows the Twelve-Factor App where it matters: config from the
environment (III), backing services as attached resources (IV), stateless
processes (VI), logs to stdout (XI), and dev/prod parity through the same Docker
images (X).

## 26. Project application is containerized using Docker; Docker is the only host prerequisite

`docker compose up --build` starts seven services:

| Service | Role |
|---|---|
| `postgres` | system of record, healthchecked so dependents wait for readiness |
| `redis` | cache, token buckets, JWT denylist |
| `rabbitmq` | message queue + management UI on `:15672` |
| `mailpit` | SMTP sink with a web inbox on `:8025` |
| `api` | Express API; runs `migrate && seed` on boot, so a clean clone self-provisions |
| `worker` | same image, different command — queue consumers |
| `web` | multi-stage build: Node compiles the SPA, nginx serves it and terminates TLS |

No Node, Postgres, Redis or OpenSSL needed on the host. The TLS certificate is
generated during the image build, and every environment variable has a working
default in `docker-compose.yml`, so the stack runs with no `.env` at all. Named
volumes (`pgdata`, `uploads`) keep data across rebuilds.

For Project 2, payment testing additionally needs the Stripe CLI, which the
brief explicitly permits.

---

## Extra credit items

**Authentication quality.** Refresh-token family theft detection; hashed token
storage; AES-256-GCM encryption of PII at rest (phone numbers, TOTP secrets);
bcrypt passwords; identical error responses for wrong-password and unknown-email
to prevent account enumeration; token-bucket rate limiting that is strictest on
auth endpoints; and admin 2FA enforced at the authorization layer.

**Database quality.** Generated columns making imperial units and the search
vector impossible to desynchronize; CHECK constraints and foreign keys enforcing
invariants in the database rather than in application code; money as integer
cents; an ERD covering all three projects; `jsonb` for extensibility without
migrations.

**Catalog quality.** Tree-aware category filtering with recursive counts;
facet counts that exclude their own dimension; weighted full-text relevance
alongside trigram typo tolerance; Redis read-through caching that fails open.

**Docker.** Single-command startup; self-provisioning migrations and seeds;
healthcheck-gated startup ordering; one image serving both the API and the
worker; multi-stage frontend build.
