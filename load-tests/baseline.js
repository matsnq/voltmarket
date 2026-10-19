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
    'flow_shop': ['p(95)<5000'],
  },
};

export function setup() {
  return fetchCatalogue();
}

export function browsing(data) { browse(data); }
export function searching(data) { search(data); }
export function shopping(data) { shop(data); }
export function accounts() { account(); }
