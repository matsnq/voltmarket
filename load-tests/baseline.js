// Target run: does the platform meet the objectives at the stated load?
//
//   k6 run load-tests/baseline.js
//
// 50 concurrent users, mixed the way real traffic mixes: mostly reading,
// some searching, a minority buying, a few signing up.
import { browse, search, shop, account, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true, // the stack uses a self-signed certificate
  scenarios: {
    browsing: {
      executor: 'constant-vus', vus: 30, duration: '3m',
      exec: 'browsing', tags: { flow: 'browse' },
    },
    searching: {
      executor: 'constant-vus', vus: 10, duration: '3m',
      exec: 'searching', tags: { flow: 'search' },
    },
    shopping: {
      executor: 'constant-vus', vus: 8, duration: '3m',
      exec: 'shopping', tags: { flow: 'shop' },
    },
    accounts: {
      executor: 'constant-vus', vus: 2, duration: '3m',
      exec: 'accounts', tags: { flow: 'account' },
    },
  },
  thresholds: {
    // The objectives, stated as pass/fail so the run itself reports them.
    'http_req_duration': ['p(90)<2000'],          // 90% under 2 s
    'http_req_failed': ['rate<0.05'],             // under 5% errors
    'checks': ['rate>0.98'],                      // 98% of transactions succeed
    'http_reqs': ['rate>10'],                     // at least 10 req/s
    'rate_limited_429': ['count==0'],             // the limiter must be off

    // Per-step latency. The flow_* trends deliberately include think time —
    // they are journey durations, not server latency — so a threshold on
    // them would just be measuring our own sleep() calls. These are the
    // numbers that say something about the system.
    'http_req_duration{step:listing}': ['p(95)<2000'],
    'http_req_duration{step:detail}': ['p(95)<2000'],
    'http_req_duration{step:suggest}': ['p(95)<500'],
    'http_req_duration{step:add_to_cart}': ['p(95)<2000'],
    'http_req_duration{step:checkout}': ['p(95)<3000'],
    'http_req_duration{step:register}': ['p(95)<5000'],
    'http_req_duration{step:login}': ['p(95)<5000'],
  },
};

export function setup() {
  return fetchCatalogue();
}

export function browsing(data) { browse(data); }
export function searching(data) { search(data); }
export function shopping(data) { shop(data); }
export function accounts() { account(); }
