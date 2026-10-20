# Voltmarket — Project 2 (Commerce) Assessment Answers

> **This is an earlier submission, kept for reference.** If you are reviewing
> the current one (Project 3 — Experience), you want **[ANSWERS.md](ANSWERS.md)**.

Shopping cart, checkout, payments and order management. Everything below
answers the Project 2 review criteria.

Voltmarket is built in three stages. Project 1 (Foundation: authentication,
database, product catalog) was submitted and reviewed previously; its criteria
are answered in **[ANSWERS-P1.md](ANSWERS-P1.md)** if you want the background,
but you do **not** need it to review this submission. Project 3 (Experience)
is not yet submitted.

Every mandatory review item for Project 2, in the order the audit lists them.
Explanation items are answered in prose; verifiable items come with the command
that proves them.

Assumes the stack is running (`docker compose up --build`) and, for the payment
items, that Stripe keys are configured and `stripe listen` is forwarding — see
**Enabling payments** in the README.

---

## 1. The README contains an updated project overview, ERD, setup instructions and usage guide for the commerce functionality

`README.md` covers all four for commerce specifically: the status section lists
what Project 2 delivers and includes a diagram of the order lifecycle; the ERD
(full version in `docs/erd.md`) now contains every commerce table with no
"future work" markers; setup adds the Stripe CLI prerequisite with step-by-step
key configuration and a test-card table; and the usage guide has runnable
`curl` examples for cart, shipping methods, checkout, guest order lookup, order
history and cancellation.

## 2. The database schema supports the shopping cart, including guest carts and persistent carts

```mermaid
erDiagram
    users |o--o{ carts : "owns (guests: none)"
    carts ||--o{ cart_items : "holds"
    products ||--o{ cart_items : "appears in"
```

One `carts` table serves both cases, distinguished by which owner column is
populated:

| Column | Guest cart | Logged-in cart |
|---|---|---|
| `user_id` | `NULL` | the owner |
| `guest_token` | random cookie token | `NULL` |
| `expires_at` | 30 days | `NULL` — persists indefinitely |

Two constraints enforce the rule rather than trusting application code:

```sql
-- exactly one kind of owner, never both and never neither
CHECK ((user_id IS NOT NULL AND guest_token IS NULL)
    OR (user_id IS NULL AND guest_token IS NOT NULL))

-- a user can only ever have one cart
CREATE UNIQUE INDEX carts_one_per_user ON carts (user_id) WHERE user_id IS NOT NULL;
```

`cart_items` has `UNIQUE (cart_id, product_id)`, so a product appears once with
a quantity rather than as repeated rows, and `CHECK (quantity > 0)`.

**Why server-side rather than a cookie or localStorage:** a cart in browser
storage cannot be merged on login without the client replaying it, is lost when
the shopper switches device, and cannot be read by the checkout transaction.

## 3. The cart displays product information for each item, including name, price and a thumbnail

`GET /api/v1/cart` returns everything the page renders, and the cart page shows
it at `/cart`.

```bash
curl -k -b cart.txt https://localhost/api/v1/cart
```

Each line carries `name`, `unitPrice`, `lineTotal`, `quantity`, `image`,
`imageAlt`, `stockQuantity`, plus two flags the UI acts on: `exceedsStock` and
`unavailable`.

## 4. Users can add, remove and update quantities with real-time total calculations

| Action | Endpoint |
|---|---|
| Add | `POST /cart/items` |
| Update quantity | `PATCH /cart/items/:itemId` |
| Remove | `DELETE /cart/items/:itemId` |
| Empty the cart | `DELETE /cart` |

Every mutation returns the **recalculated cart**, so the browser never derives
totals itself and cannot drift from the server. Totals are computed by
`calculateTotals()` in `cart.service.js`, which is a pure function — hence
unit-testable without a database (`tests/unit/cart.test.js`).

Money is integer cents throughout. Binary floating point cannot represent 0.10
exactly, so repeated float arithmetic drifts; one test adds ten 10-cent lines
and asserts exactly 100.

## 5. A guest cart is implemented for non-registered users

On first add, the server mints a random token, stores the cart row and sets an
`httpOnly` cookie. The shopper needs no account and the cart survives a browser
restart because the contents live in Postgres, not the cookie.

The cookie is `SameSite=Lax` rather than `Strict` — deliberately, because the
shopper returns from Stripe's domain and a `Strict` cookie would not be sent on
that navigation, losing the cart at the worst possible moment.

## 6. A persistent cart is implemented for logged-in users, retained across sessions

A logged-in cart is keyed by `user_id` with no expiry, so it is still there on
the next device or next month.

**The interesting case is the merge.** When a request arrives with both a guest
cookie and a valid token, `mergeGuestIntoUser()` runs first, in a transaction:
quantities for the same product are **summed**, then capped at available stock
and the 20-per-line maximum; the guest cart is deleted. Summing is the correct
behaviour — a shopper who added two chargers while logged out and one while
logged in wants three, not whichever cart happened to win.

```bash
# 1. add to the account cart while logged in
curl -k -H "Authorization: Bearer $TOKEN" -X POST https://localhost/api/v1/cart/items \
  -H 'Content-Type: application/json' -d "{\"productId\":\"$P\",\"quantity\":1}"
# 2. add to a guest cart while logged out
curl -k -c guest.txt -X POST https://localhost/api/v1/cart/items \
  -H 'Content-Type: application/json' -d "{\"productId\":\"$P\",\"quantity\":2}"
# 3. present both -> merged to 3
curl -k -b guest.txt -H "Authorization: Bearer $TOKEN" https://localhost/api/v1/cart
```

Covered by `tests/integration/checkout.test.js` → *"a guest cart merges into the
account on login"*.

## 7. Out-of-stock scenarios are handled gracefully when adding to the cart

Three layers, each with a message that tells the shopper what to do:

- Product with zero stock → `409 "This product is out of stock"`
- Requesting more than exists → `409 "Only 3 left in stock and you already have 2 in your cart."`
- Above the per-line cap → `400 "You can order at most 20 of one item."`

If stock falls *after* an item is already in a cart, the line is **flagged, not
silently reduced** (`exceedsStock: true`). Quietly changing someone's basket is
worse than telling them; checkout then refuses until it is corrected.

## 8. The system implements a single-page checkout

`/checkout` is one page and one URL. The left panel is a live order summary
where quantities can still be changed; the right panel holds contact details,
delivery address, delivery method and payment. The stepper at the top is a
**progress indicator, not navigation** — nothing routes away mid-checkout.

## 9. The checkout page collects basic information, address input and payment selection

Contact (email), delivery address (recipient, street, city, postal code,
country, optional phone), delivery method (four options with prices and ETAs),
then payment via Stripe's `PaymentElement`, which itself offers the payment
methods enabled on the account.

## 10. For logged-in users, known information is pre-filled

`Checkout.jsx` fills email, recipient name and phone from the authenticated
profile on mount. Guests see an inline prompt to log in instead, with their
cart preserved.

## 11. The system validates the entered shipping address for accuracy

Two layers. The client mirrors the rules for instant feedback; the **server is
the authority**, because anyone can bypass a browser with `curl`.

| Kind | Example |
|---|---|
| Syntactic | email shape, postal code `^[A-Za-z0-9 -]+$`, phone `^\+?[0-9 ()-]{5,20}$` |
| Semantic | country must be one we actually ship to |
| Whitelisting | `.strict()` — unknown fields rejected, not ignored |

The country check is a **whitelist of 16 destinations**, not a blocklist:

```bash
curl -k -X POST https://localhost/api/v1/checkout -H 'Content-Type: application/json' \
  -d '{"email":"a@b.co","shippingMethodId":1,"shippingAddress":{"recipient":"Test",
       "street":"Main 1","city":"NYC","postalCode":"10001","country":"US"}}'
# {"error":"Validation failed","details":[{"field":"shippingAddress.country",
#  "message":"We do not ship to that country yet"}]}
```

## 12. An order summary is provided during checkout, showing all items, quantities and costs

The left panel lists every line with thumbnail, unit price, quantity and line
total, then subtotal, shipping (updating live as the delivery method changes)
and total. Quantities remain editable and items removable **without leaving
checkout**.

## 13. The system sends an email confirmation after successful order placement

Sent by the queue worker once payment is confirmed, not at order placement —
confirming an order that was never paid for would be wrong. It contains the
reference, every line with prices, shipping, total, the delivery method with
its ETA and a tracking link.

In this environment mail goes to Mailpit: **http://localhost:8025**

## 14. The checkout handles and displays error messages for invalid inputs and failed transactions

| Case | What the shopper sees |
|---|---|
| Missing required field | *"Email is required"*, *"Street address is required"* … per field |
| Invalid email | *"Please enter a valid email address"* |
| Invalid phone | *"Enter a valid phone number"* |
| Unsupported country | *"We do not ship to that country yet"* |
| Stock changed mid-checkout | *"Only 2 × 'Wallbox Pulsar' left in stock. Please update your cart."* |
| Card declined | see item 22 — a specific message per decline code |
| Network / provider down | *"We could not reach the payment service. Check your connection and retry."* |

Errors are attached to the field that caused them via `aria-describedby` and
announced with `role="alert"`; focus moves to the first invalid input. Server
validation errors are mapped back onto the matching inputs rather than dumped
as one banner.

## 15. The payment system integrates with a sandbox API

Stripe, using **PaymentIntents**. The server creates an intent for the order
total and returns only its `client_secret`; the browser confirms it directly
with Stripe.

```bash
curl -k -X POST https://localhost/api/v1/payments/intent/<orderId>
# {"clientSecret":"pi_3UQM..._secret_...","publicKey":"pk_test_..."}
```

Reloading the payment page reuses the existing intent rather than creating a
duplicate.

## 16. The payment form uses the provider's secure form elements rather than handling card details directly

`PaymentSection.jsx` renders Stripe's `<PaymentElement>`. The inputs are
**Stripe-hosted iframes on Stripe's own origin** — our JavaScript cannot read
them, and the card number never enters our DOM, our memory, our logs or our
database. Stripe's Appearance API is configured so they match the surrounding
form visually.

This is the single most important decision in Project 2, and the reason is item
19.

## 17. Card validation checks number format, expiry date and CVV before submission

Performed inside the Stripe element: Luhn checksum on the number, card-network
detection, expiry in the future, CVC length correct for the network. Nothing is
submitted until these pass, and `elements.submit()` surfaces any remaining
issue before confirmation.

Demonstrate with `4242 4242 4242 4241` — one digit altered, so it fails Luhn and
the field rejects it without any network call.

Doing this ourselves would mean touching the card number, which is exactly what
item 16 forbids.

## 18. Student can explain PCI DSS compliance and why sensitive payment data must not be stored on application servers

**PCI DSS** is the card industry's security standard. Its scope covers any
system that stores, processes or transmits cardholder data — and scope is the
whole game, because the obligations are heavy: network segmentation, encryption
key management, quarterly scans, annual audits, penetration testing.

**How Voltmarket stays out of scope.** Card data goes from the shopper's
browser straight to Stripe, inside iframes served from Stripe's domain. It
never reaches this server. That qualifies as **SAQ-A**, the shortest
self-assessment, instead of SAQ-D with its hundreds of controls.

**Why storing card data is wrong even if encrypted.** Stored data is a target
forever, and encryption only moves the problem to key management — whoever can
decrypt for normal operation can decrypt after a breach. The industry answer is
**tokenisation**: keep a reference that is worthless to a thief. Our `payments`
table holds exactly that:

```bash
docker exec i-love-shopping-postgres-1 psql -U shop -d shop -c "\d payments"
```

There is no column capable of holding a PAN, expiry or CVC — a test asserts
this (`tests/security/security.test.js`). Note also that **CVC may never be
stored at all**, encrypted or not, under any circumstances.

The breaches named in the brief make the point: Target and Heartland both lost
card data they were holding or passing through. Data you never receive cannot
be stolen from you.

## 19. The order system updates status on callbacks from the payment provider

Stripe calls `POST /api/v1/payments/webhook`. The handler verifies the
signature with `STRIPE_WEBHOOK_SECRET` against the **raw request bytes** —
which is why that route is mounted with `express.raw` before the JSON parser;
parsing and re-serialising would change the bytes and break verification.

State transitions:

| Stripe event | Order becomes | Side effect |
|---|---|---|
| `payment_intent.succeeded` | `paid` | confirmation email, stock stays reserved |
| `payment_intent.payment_failed` | `payment_failed` | **stock released**, failure email |
| `payment_intent.canceled` | `payment_failed` | stock released |

Transitions only apply from `pending_payment`, so a late or duplicate event
cannot move a settled order backwards.

### Webhooks can be missed, so the system also pulls

A webhook is a *push*, and pushes get lost — the tunnel dies, the server is
restarting, the endpoint is briefly unreachable. **This actually happened during
development:** a real browser payment succeeded at Stripe while the
`stripe listen` tunnel had died with an expired OAuth token. The customer was
charged €1,011.99 and the order sat in `pending_payment`. Money had moved and
the shop had no idea — the worst failure this system can produce.

Relying on an inbound call alone is therefore not enough. Reading an order that
still looks unpaid now also **pulls**: `reconcilePendingPayment()` asks Stripe
what actually happened and, if Stripe disagrees with us, feeds the answer
through *the same queue the webhook uses*, so there is exactly one code path
that settles an order.

```
push:  Stripe ──► webhook ──────┐
                                 ├──► RabbitMQ ──► worker ──► order settled
pull:  order page ──► ask Stripe ┘
```

The idempotency key is the **PaymentIntent id**, not an event id:

```js
await claimEvent(`reconcile:${intent.id}`, 'queue', { orderId });
```

so a webhook that turns up late for a payment already reconciled collides on
the primary key and is skipped. Whichever path arrives second does nothing, and
an order can never be processed twice.

It costs one API call, and only while an order is genuinely pending. It no-ops
safely when Stripe is unconfigured.

```bash
# the log line proving a stuck order healed itself
docker compose logs api | grep reconcile
# [reconcile] order c8401601-… -> succeeded from Stripe
docker compose logs worker | grep reconcile
# [worker] order VM-RUZTFW -> paid (event reconcile_pi_3UQQBW…)
```

**Why this is the right design rather than a patch.** Stripe does retry a
registered endpoint for days, so in production the push would usually recover
on its own. But the shop should not depend on another company's retry schedule
to know whether it has been paid. Reconciliation makes the correct state
reachable at any moment from our side, and because both paths converge on the
same consumer with the same guard, it adds a recovery route without adding a
second way for things to go wrong.

## 20. The payment system publishes status updates to a message queue

The webhook publishes to the `shop.events` topic exchange in RabbitMQ with
routing key `payment.succeeded` or `payment.failed`, then returns `200`. The
worker — a separate container from the same image — consumes `payment.status`
and does the real work.

**Why not just update the order in the webhook?** Stripe retries anything that
does not answer quickly. If a slow mail server held the response open, Stripe
would redeliver and the order could be processed twice. The queue makes the
webhook fast and the slow work independently retryable.

Verify, watching three windows at once:

```bash
docker compose logs -f worker     # [worker] order VM-XXXX -> paid (event evt_...)
# the `stripe listen` terminal shows: --> payment_intent.succeeded ... <-- [200]
open http://localhost:15672       # RabbitMQ management, guest/guest
```

Reliability: publisher confirms on send, `prefetch(5)`, up to 3 attempts with
increasing delay, then the message is dead-lettered to `shop.dead-letter`
rather than looping forever. A malformed message is dead-lettered immediately —
it can never succeed.

**Idempotency** is mandatory here: Stripe delivers at-least-once and RabbitMQ
redelivers on nack. Every side effect is guarded by inserting into
`processed_events`; the insert *is* the lock, because a duplicate violates the
primary key. The worker log shows this working:
`[worker] duplicate event evt_..., skipping`.

## 21. Emails are sent for both successful and failed payments

Success: *"Order VM-XXXX confirmed ⚡"* with the full summary. Failure: *"Payment
failed for order VM-XXXX"*, stating plainly that nothing was charged and the
items have been returned to stock, with a link back to the cart.

Both verified in Mailpit during the failure testing below.

## 22. The payment system responds to specific failure scenarios

All four required cases were run end to end against the Stripe sandbox.

Use these at `https://localhost/checkout`. **Only the card number matters** —
type **any future expiry** (e.g. `12 / 30`) and **any 3-digit CVC** (e.g.
`123`); neither is validated against anything in test mode.

Mapped against the four the brief names:

| Required scenario | Test card | Stripe code | Order status | Stock | Message shown |
|---|---|---|---|---|---|
| **Insufficient funds** | `4000 0000 0000 9995` | `insufficient_funds` | `payment_failed` | released | *"Your card was declined for insufficient funds. Try another card."* |
| **Invalid card number** | `4242 4242 4242 4241` | — | never submitted | untouched | rejected by Stripe's field before any request (fails Luhn) |
| **Expired card** | `4000 0000 0000 0069` | `expired_card` | `payment_failed` | released | *"That card has expired. Please use a different card."* |
| **Gateway timeout / error** | `4000 0000 0000 0119` | `processing_error` | `payment_failed` | released | *"The payment provider had a problem processing your card. Please try again in a moment."* |
| (extra) Incorrect CVC | `4000 0000 0000 0127` | `incorrect_cvc` | `payment_failed` | released | *"The security code (CVC) is incorrect."* |

Two of those deserve a precise answer rather than a hand-wave:

**Invalid card number never becomes a decline.** Stripe's field runs the Luhn
checksum as the digits are typed, so a malformed number is refused locally and
no request is made. That is the better outcome — a pointless round trip avoided
— and the handler still maps `incorrect_number` and `invalid_number` for the
rare case a network does surface one.

**The sandbox has no true timeout card.** `processing_error` is the
gateway-side failure Stripe can simulate, so that is what the "gateway
timeout" case exercises. The handler additionally maps `api_connection_error`
and `api_error`, and a real transport failure — stop the API container
mid-payment — produces *"We could not reach the payment service. Check your
connection and retry."* rather than a stack trace.

Stripe's own messages are deliberately generic; `friendlyPaymentError()` in
`PaymentSection.jsx` maps decline codes to guidance that tells the shopper what
to do next.

## 23. The inventory system prevents overselling during concurrent payments

Stock is **reserved at order placement**, inside the checkout transaction:

```sql
SELECT * FROM products WHERE id IN (…) ORDER BY id FOR UPDATE;
```

Postgres defaults to READ COMMITTED, where two shoppers can both read "1 in
stock" and both proceed — overselling is a race condition, not a validation
failure. The row lock serialises them: the second transaction blocks until the
first commits, then re-reads the real number and fails. Locks are taken in id
order so two orders containing the same products in different sequences cannot
deadlock. The decrement is additionally guarded by
`WHERE stock_quantity >= quantity`, so no path can drive stock negative.

Reserving at placement rather than at payment means a shopper who has reached
the payment step cannot lose the item to someone faster.

**A decline does not release the reservation.** Stripe keeps a PaymentIntent
usable after a failed card, so the shopper can try another one — and releasing
the stock at that moment would let somebody else buy the item out from under
them, producing a charged customer with an order marked failed. The goods stay
held for `RESERVATION_MINUTES` (60), and a sweeper in the worker releases
anything nobody came back for, cancelling the order with *"Payment not
completed in time"*. That is what stops abandoned checkouts consuming the
catalogue.

Proven by `tests/integration/checkout.test.js` → *"two concurrent checkouts
cannot oversell the last unit"*: one order is created, the other rejected, and
stock lands at exactly 0.

## 24. Order filtering allows users to sort by date and status

```bash
curl -k -H "Authorization: Bearer $TOKEN" \
  'https://localhost/api/v1/orders?status=paid&from=2026-10-01&to=2026-10-31&page=1&perPage=10'
```

Status is validated against an enum, dates against `YYYY-MM-DD` with a semantic
check that `from` is not after `to`. Results are newest-first and paginated.
Order history is scoped to the authenticated user — a test confirms another
account sees none of it and gets `403` on a direct reference.

## 25. The order details page displays full order information including status updates

`/orders/:reference` shows the status banner, decrypted delivery address,
shipping method with a **calculated delivery window**, itemised totals, and a
status timeline built from `order_events`.

Guests have no account, so they authenticate with **reference + the email used**
— two pieces of information only the buyer holds. The comparison uses the blind
index, so the stored address is never decrypted merely to authorise a lookup.

**Status updates and tracking.** Staff move an order along with
`PATCH /orders/:reference/fulfilment`, which also attaches a carrier tracking
number:

```bash
curl -k -X PATCH https://localhost/api/v1/orders/VM-XXXXXX/fulfilment \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"shipped","trackingNumber":"EE 1234 5678 9EE"}'
```

Transitions are **whitelisted, not freeform** — `paid → processing → shipped →
delivered` — so a typo or a replayed request cannot send a delivered order back
to the warehouse. Each step appends to the customer-visible timeline and writes
an `audit_logs` row naming the staff member, the transition and the tracking
number.

Access is restricted to `admin` and `sales`, and because the same `authorize`
middleware guards it, **an admin who has not enrolled 2FA is refused**:

```
customer            → 403 Insufficient permissions
admin without 2FA   → 403 Admins must enable two-factor authentication first
admin with 2FA      → 200, order advances
```

Shipping it also closes cancellation, which is how the
"cancel only before processing" rule becomes observable:

```
pending_payment -> paid -> processing -> shipped -> delivered
# cancelling now: 409 "An order that is already delivered cannot be
#                      cancelled. Request a refund instead."
```

## 26. Order cancellation is allowed for unprocessed orders

Permitted from `pending_payment`, `payment_failed` and `paid`; refused once
`processing`, `shipped` or beyond, with *"An order that is already shipped
cannot be cancelled. Request a refund instead."* Cancelling re-locks the order
row, releases the stock and records a timeline entry — all in one transaction.
Cancelling twice is refused.

**Cancelling a paid order also returns the money.** The transaction reports
that a refund is owed, and the route then issues it through Stripe — outside
the transaction, because a network call must never be held inside a database
lock. If the refund itself fails the cancellation still stands and the response
says so plainly, rather than implying the money came back:

```bash
curl -k -X POST https://localhost/api/v1/orders/VM-XXXXXX/cancel \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Changed my mind"}'
# {"order":{...,"status":"refunded"},"refund":{"amountCents":76899,"status":"succeeded"}}

# Staff can also refund directly, in full or in part:
curl -k -X POST https://localhost/api/v1/orders/VM-XXXXXX/refund \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"amountCents":2000,"reason":"Damaged packaging"}'
```

## 27. Stock levels update when orders are placed or cancelled

| Event | Stock |
|---|---|
| Order placed | decremented, with a 60-minute reservation |
| Payment failed | **stays reserved** — the shopper may try another card |
| Reservation expires | restored, order cancelled automatically |
| Order cancelled | restored (and the money refunded if it was paid) |
| Payment succeeded | stays decremented — the goods are sold |

```bash
# watch it move
docker exec i-love-shopping-postgres-1 psql -U shop -d shop \
  -c "SELECT name, stock_quantity FROM products WHERE slug='wallbox-pulsar-plus-11-kw';"
```

## 28. All sensitive data is encrypted at rest for order and payment data

| Data | Protection |
|---|---|
| Shipping address | AES-256-GCM, snapshotted onto the order |
| Buyer email | AES-256-GCM + HMAC blind index |
| Passwords | bcrypt (hashed — never decryptable) |
| Refresh / reset tokens | SHA-256 hashes |
| Phone, TOTP secrets | AES-256-GCM |
| Card data | **never received**, so nothing to encrypt |

```bash
docker exec i-love-shopping-postgres-1 psql -U shop -d shop \
  -c "SELECT reference, email_enc, shipping_address_enc FROM orders LIMIT 2;"
```

Both columns are `iv.tag.ciphertext`, not readable text.

**The blind index is worth explaining.** AES-GCM is randomised — the same email
encrypts differently every time — which makes an encrypted column unsearchable.
But guest order lookup needs an equality match on email. So `email_hash` stores
an **HMAC-SHA256** of the normalised address: deterministic enough to look up,
and because it is keyed rather than a bare hash, someone holding a stolen
database cannot brute-force common email addresses without also holding the key.

The address is **snapshotted** onto the order rather than referenced, so editing
a saved address later cannot rewrite where a past order was shipped.

## 29. Student can explain their approach to testing cart functionality, checkout flows and payment integration

**140 tests: 55 unit, 70 integration, 15 security** at the time of this
submission. Each layer earns its place. (Project 3 took the suite to 175 —
see [ANSWERS.md](ANSWERS.md); this document records what Project 2 shipped.)

**Cart — unit tests** (`tests/unit/cart.test.js`, 9 tests). Total calculation is
a pure function, so it is tested without a database: quantity multiplication,
mixed lines, shipping added to the total but never the subtotal, integer-cent
exactness, and the stock flags.

**Order summary — unit tests** (`tests/unit/order-summary.test.js`, 11 tests):
subtotal + shipping = total, line totals summing to the subtotal, free shipping
as zero rather than absent, snapshot prices surviving catalog changes, and
reference format.

**Checkout — integration tests** (`tests/integration/checkout.test.js`, 26
tests) through real HTTP against real Postgres and Redis, because the guest and
logged-in journeys are properties of the whole request path. Guest shopping,
merge on login, order history privacy, cancellation with stock release, and the
concurrency case — which *cannot* be unit-tested, since the thing under test is
two transactions racing.

**Payments — a deliberate split.** Automated tests cover everything up to the
provider boundary: order state transitions, stock release on failure, and
idempotency of redelivered messages. What is *not* automated is Stripe itself —
I verified that manually against the sandbox with the Stripe CLI, running the
success path and all four failure scenarios end to end. Mocking Stripe would
test my mock; using the sandbox tests the integration.

That split has a limit worth admitting. The missed-webhook bug (item 19) was
invisible to the whole test suite, because every automated test drove the queue
directly and so always had a working delivery path. It only appeared when I
paid through the browser with the tunnel dead. The lesson I took from it is
that tests prove the paths you thought of; the ones you did not think of are
found by using the thing. For reconciliation I automated the properties that
can be pinned without a live account — that it no-ops when Stripe is
unconfigured, leaves orders without a pending payment untouched, and that its
idempotency key collides as intended — and verified the actual recovery by
hand against the sandbox.

## 30. Automated tests exist for unit tests (cart, order calculations) and critical user flows (registration, checkout)

| File | Layer | Tests | Covers |
|---|---|---|---|
| `tests/unit/cart.test.js` | unit | 9 | item management, totals, stock flags |
| `tests/unit/order-summary.test.js` | unit | 11 | pricing, shipping, snapshots, references |
| `tests/integration/auth.test.js` | flow | 13 | **registration**, login, rotation, 2FA |
| `tests/integration/checkout.test.js` | flow | 26 | **checkout** guest + logged-in, concurrency, reconciliation, fulfilment |
| `tests/security/security.test.js` | security | 15 | injection, rate limiting, **encryption at rest** |

```bash
cd backend && npm test          # all 140
npx jest tests/integration/checkout.test.js --verbose
```

## 31. Ask the student to explain and demonstrate the tests

Three worth walking through:

- **"two concurrent checkouts cannot oversell the last unit"** — sets stock to
  1, fires two checkouts with `Promise.all`, asserts exactly one `201`, one
  `409`, and final stock of 0. This is the headline test.
- **"a guest cart merges into the account on login"** — proves quantities are
  summed rather than overwritten.
- **"status transitions are idempotent"** — calls `markPaid` twice then
  `markPaymentFailed`, and asserts the order stays `paid` with no double stock
  release. This is what makes at-least-once delivery safe.

## 32. The project is containerised; host prerequisites are Docker and the payment simulation CLI

`docker compose up --build` starts seven services: postgres, redis, rabbitmq,
mailpit, api, worker (same image, different command) and nginx with TLS. The
API migrates and seeds itself on boot. The only other host requirement is the
Stripe CLI, which the brief explicitly permits.

Tests need no Node on the host either:

```bash
docker run --rm -v "$PWD/backend":/app -w /app --network i-love-shopping_default \
  -e NODE_ENV=test \
  -e ADMIN_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop \
  -e TEST_DATABASE_URL=postgres://shop:shop_secret@postgres:5432/shop_test \
  -e REDIS_URL=redis://redis:6379 \
  node:24-alpine sh -c "npm ci && npx jest --runInBand"
```

---

## Extra credit

**Cart quality.** Server-side persistence so carts survive device changes;
merge-on-login that sums quantities; `SameSite=Lax` chosen specifically so the
cart survives the return trip from Stripe; recommendations drawn from the
categories already in the basket; stock problems flagged rather than silently
corrected.

**Checkout and error handling.** One page, no navigation mid-flow; summary stays
editable; prefill for known shoppers; validation mirrored client and server with
the server as authority; decline codes translated into actionable guidance;
graceful degradation when Stripe is unconfigured — the order is still placed and
the stock reserved.

**Payment security.** Card data never reaches the server; signature verification
over raw bytes; no column capable of holding card data, asserted by test;
reused intents instead of duplicates on reload.

**Refunds.** `POST /orders/:reference/refund` for staff (full, or partial with
`amountCents`), `GET /orders/:reference/refunds` for the history, and
cancelling an order that was already paid returns the money automatically
rather than only the stock. Over-refunding is rejected.

**Order management and queue.** Durable topic exchange with publisher confirms,
bounded retries and a dead-letter queue; idempotency via `processed_events`
covering both Stripe and RabbitMQ at-least-once delivery; a customer-visible
status timeline; partial and full refunds with over-refund protection.

**Resilience.** Payment state is recoverable from both directions: the webhook
pushes, and reading a pending order pulls from Stripe. Both converge on one
consumer guarded by one idempotency key, so a missed webhook cannot leave a
paid order looking unpaid, and a late webhook cannot double-process a
reconciled one.
