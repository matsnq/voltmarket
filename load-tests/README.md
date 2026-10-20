# Load tests

Six k6 profiles that drive the real API over HTTPS, modelling how people
actually use the shop rather than hammering one endpoint. They share the four
flows in `lib/flows.js`.

**Journey-paced** — virtual users with think time, which is what "concurrent
users" means:

| File | What it is for |
| --- | --- |
| `smoke.js` | One pass of every flow at 2 VUs. Proves the script and the environment work before spending minutes on a measurement. |
| `baseline.js` | The target run: 50 concurrent users for 3 minutes. Its thresholds are the objectives, so the run itself reports pass or fail. |
| `step.js` | One concurrency level per run (`VUS=200`), so each run is a single clean data point rather than an average across a ramp. |
| `stress.js` | Ramps 10 → 400 VUs. Kept for the shape of the curve, but see the note below — it could not answer the question it was written for. |

**Arrival-rate driven** — think time off, the request rate is the independent
variable. These are what found the ceiling:

| File | What it is for |
| --- | --- |
| `capacity.js` | Ramps 100 → 2000 journeys/s to find roughly where the platform gives out. |
| `rate.js` | One fixed rate per run (`RATE=250`), to pin the number down either side of that. |

### Why both kinds exist

Concurrency alone never stressed this platform. Think time, not the server,
sets the pace: a browsing user issues about six requests across ten seconds,
so 400 concurrent users generate only ~250 requests a second however fast the
server is, and the API sat under half a core. `stress.js` was written to find
the concurrency at which the 95th percentile crosses five seconds, and the
honest answer is that it does not, short of a load generator far larger than
one laptop.

Setting `THINK=0` removes the pauses, and the arrival-rate executors then push
requests regardless of how long a response takes. That is what located the
ceiling at ~1,355 req/s. Without it the report would have concluded "no
bottleneck found", which would have been false.

## The four flows

Defined once in `lib/flows.js` and shared by all three profiles.

1. **browse** — categories, a category listing, two product pages with their
   reviews. The commonest visit, and the bulk of the traffic mix.
2. **search** — suggestions as the user types, then the results page and a
   product. Suggestions fire per keystroke, so this is the highest-frequency
   endpoint even though each call is small.
3. **shop** — product page, add to cart, view cart, shipping methods,
   checkout. The write path: stock is reserved inside a transaction holding a
   row lock, which is where contention appears first.
4. **account** — register, log in, read order history. Both ends hash with
   bcrypt, which is deliberately slow and CPU-bound.

Every flow includes think time. Without it the test measures how fast a loop
can spin, not how the system behaves under people.

## Running them

The rate limiter has to come off first. Every virtual user comes from one
machine, so they share a source IP and land in the same token bucket — 120
tokens refilling at 2 per second. Left on, the run measures the limiter and
50 concurrent users can never be reached by design:

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d
```

The limiter itself is covered separately by the automated test in
`backend/tests/security/security.test.js`, so turning it off here does not
leave it unverified. `baseline.js` asserts `rate_limited_429: count==0`, so a
run against a limited stack fails loudly rather than reporting nonsense.

Then:

```bash
k6 run load-tests/smoke.js                       # always start here
k6 run load-tests/baseline.js                    # the objectives, pass/fail

VUS=200 DURATION=90s k6 run load-tests/step.js   # one concurrency level
THINK=0 k6 run load-tests/capacity.js            # ramp to find the ceiling
THINK=0 RATE=250 k6 run load-tests/rate.js       # pin a specific rate
```

`THINK=0` matters for the last two: leave it on and you measure the `sleep()`
calls rather than the server.

Point them elsewhere with `-e BASE_URL=https://staging.example.com`.

### Before and after

`shop` places real orders and consumes stock. Top it up first, and put the
catalogue back afterwards:

```bash
cd backend && node -e "require('knex')(require('./knexfile').development)('products').update({stock_quantity:100000}).then(()=>process.exit(0))"
# ... run the tests ...
cd backend && npx knex seed:run --specific=02_catalog.js
```

Load-test accounts and orders use `@k6.local` addresses, so they are easy to
find and remove afterwards.

Return the stack to its normal, rate-limited configuration when you are done:

```bash
docker compose up -d
```

## Running them on a laptop

Measure on mains power, with the lid open.

On battery — particularly below about 20% — macOS suspends the machine every
half minute or so. k6 keeps counting wall-clock time across the gap, so a
three-minute run reports as nineteen minutes, throughput collapses by a
factor of thirty and individual requests appear to take a quarter of an hour.
The numbers are fiction, and the failure is easy to mistake for a problem in
the application. The giveaway is the progress line: the wall clock jumps in
~26-second steps while the scenario clock advances by one second.
