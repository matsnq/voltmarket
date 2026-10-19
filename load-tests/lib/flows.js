import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

export const BASE = __ENV.BASE_URL || 'https://localhost';
const API = `${BASE}/api/v1`;

// Per-flow latency, so a slow checkout cannot hide behind thousands of fast
// catalogue reads in the aggregate percentile.
export const browseTime = new Trend('flow_browse', true);
export const searchTime = new Trend('flow_search', true);
export const shopTime = new Trend('flow_shop', true);
export const accountTime = new Trend('flow_account', true);

export const businessErrors = new Rate('business_errors');
export const ordersPlaced = new Counter('orders_placed');
export const rateLimited = new Counter('rate_limited_429');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// A single place to judge a response, so every flow counts failures the same
// way. A 429 is recorded separately: it means the limiter is on, which makes
// the whole run invalid rather than merely slow.
function ok(res, name, expected = 200) {
  if (res.status === 429) rateLimited.add(1);
  const good = check(res, { [`${name} -> ${expected}`]: (r) => r.status === expected });
  businessErrors.add(!good);
  return good;
}

// Real shoppers read. Without think time the test measures how fast a loop
// can spin, not how the system behaves under people.
function think(min = 1, max = 4) {
  sleep(min + Math.random() * (max - min));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SEARCH_TERMS = ['charger', 'cable', 'tesla', 'tyre', 'wallbox', 'model', 'bosch', 'suv'];

// --- Flow 1: browsing the catalogue -----------------------------------------
// The commonest visit: land, open a category, read a product, maybe another.
export function browse(data) {
  const start = Date.now();
  group('browse', () => {
    ok(http.get(`${API}/categories`, { tags: { flow: 'browse', step: 'categories' } }), 'categories');
    think();

    const category = pick(data.categories);
    ok(
      http.get(`${API}/products?category=${category}&perPage=12`, {
        tags: { flow: 'browse', step: 'listing' },
      }),
      'listing'
    );
    think();

    for (let i = 0; i < 2; i += 1) {
      const slug = pick(data.slugs);
      ok(http.get(`${API}/products/${slug}`, { tags: { flow: 'browse', step: 'detail' } }), 'detail');
      ok(
        http.get(`${API}/products/${slug}/reviews?sort=helpful`, {
          tags: { flow: 'browse', step: 'reviews' },
        }),
        'reviews'
      );
      think();
    }
  });
  browseTime.add(Date.now() - start);
}

// --- Flow 2: searching ------------------------------------------------------
// Suggestions fire per keystroke, so this is the highest-frequency endpoint
// in the system even though each call is small.
export function search(data) {
  const start = Date.now();
  group('search', () => {
    const term = pick(SEARCH_TERMS);
    for (let i = 3; i <= term.length; i += 2) {
      ok(
        http.get(`${API}/products/suggest?q=${term.slice(0, i)}`, {
          tags: { flow: 'search', step: 'suggest' },
        }),
        'suggest'
      );
      sleep(0.2);
    }

    ok(
      http.get(`${API}/products?q=${term}&perPage=12`, { tags: { flow: 'search', step: 'results' } }),
      'results'
    );
    think();

    ok(
      http.get(`${API}/products/${pick(data.slugs)}`, { tags: { flow: 'search', step: 'detail' } }),
      'detail'
    );
  });
  searchTime.add(Date.now() - start);
}

// --- Flow 3: cart and checkout ---------------------------------------------
// The write path: reserves stock inside a transaction with a row lock, which
// is where contention shows up first.
export function shop(data) {
  const start = Date.now();
  group('shop', () => {
    const slug = pick(data.slugs);
    const detail = http.get(`${API}/products/${slug}`, { tags: { flow: 'shop', step: 'detail' } });
    if (!ok(detail, 'detail')) return;

    const product = detail.json('product');
    if (!check(product, { 'product payload present': (p) => !!p })) {
      businessErrors.add(true);
      return;
    }
    think(0.5, 2);

    const added = http.post(
      `${API}/cart/items`,
      JSON.stringify({ productId: product.id, quantity: 1 }),
      { headers: JSON_HEADERS, tags: { flow: 'shop', step: 'add_to_cart' } }
    );
    if (!ok(added, 'add to cart', 201)) return;
    think(0.5, 2);

    ok(http.get(`${API}/cart`, { tags: { flow: 'shop', step: 'view_cart' } }), 'view cart');

    const methods = http.get(`${API}/shipping-methods`, {
      tags: { flow: 'shop', step: 'shipping_methods' },
    });
    if (!ok(methods, 'shipping methods')) return;
    think(1, 3);

    // The payload key is `shippingMethods`. An earlier version of this script
    // read `methods`, found undefined and returned quietly, so every checkout
    // was skipped and the run reported a clean pass having never exercised
    // the write path at all. Missing data is now a recorded failure.
    const method = methods.json('shippingMethods.0');
    if (!check(method, { 'shipping method available': (m) => !!m })) {
      businessErrors.add(true);
      return;
    }

    const placed = http.post(
      `${API}/checkout`,
      JSON.stringify({
        email: `loadtest-${__VU}-${__ITER}-${Date.now()}@k6.local`,
        shippingMethodId: method.id,
        shippingAddress: {
          recipient: 'K6 Load Tester',
          street: 'Tartu mnt 5',
          city: 'Tallinn',
          postalCode: '10117',
          country: 'EE',
        },
      }),
      { headers: JSON_HEADERS, tags: { flow: 'shop', step: 'checkout' } }
    );

    // 409 means the item sold out mid-test. That is the oversell guard doing
    // its job, not a failure of the system, so it is not counted as an error.
    if (placed.status === 409) {
      businessErrors.add(false);
    } else if (ok(placed, 'checkout', 201)) {
      ordersPlaced.add(1);
    }
  });
  shopTime.add(Date.now() - start);
}

// --- Flow 4: registration and login ----------------------------------------
// Both hash with bcrypt, which is deliberately slow and CPU-bound. This is
// the flow most likely to saturate the API container.
export function account() {
  const start = Date.now();
  group('account', () => {
    const email = `loadtest-${__VU}-${__ITER}-${Date.now()}@k6.local`;
    const password = 'LoadTest123!';

    const registered = http.post(
      `${API}/auth/register`,
      JSON.stringify({ email, password, name: 'K6 Load Tester', captchaToken: 'k6' }),
      { headers: JSON_HEADERS, tags: { flow: 'account', step: 'register' } }
    );
    if (!ok(registered, 'register', 201)) return;
    think(1, 3);

    const loggedIn = http.post(
      `${API}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: JSON_HEADERS, tags: { flow: 'account', step: 'login' } }
    );
    if (!ok(loggedIn, 'login')) return;

    const token = loggedIn.json('accessToken');
    if (!token) return;

    ok(
      http.get(`${API}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { flow: 'account', step: 'order_history' },
      }),
      'order history'
    );
  });
  accountTime.add(Date.now() - start);
}

// Shared setup: fetch real slugs and categories once so virtual users browse
// the actual catalogue rather than hard-coded guesses.
export function fetchCatalogue() {
  const params = { headers: JSON_HEADERS };
  const products = http.get(`${API}/products?perPage=50`, params);
  if (products.status !== 200) {
    throw new Error(`setup: catalogue unreachable (${products.status}) at ${API}`);
  }
  const slugs = products.json('items').map((p) => p.slug);

  const categories = http.get(`${API}/categories`, params);
  const flat = [];
  const walk = (nodes) => {
    for (const c of nodes || []) {
      flat.push(c.slug);
      walk(c.children);
    }
  };
  walk(categories.json('categories'));

  if (!slugs.length) throw new Error('setup: catalogue is empty — seed the database first');
  return { slugs, categories: flat.length ? flat : ['electric-cars'] };
}
