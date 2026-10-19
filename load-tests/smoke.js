// Sanity run: one pass of every flow at low concurrency, to prove the script
// and the environment work before spending minutes on a real measurement.
//
//   k6 run load-tests/smoke.js
import { browse, search, shop, account, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true,
  vus: 2,
  iterations: 4,
  thresholds: {
    checks: ['rate==1.0'],
    rate_limited_429: ['count==0'],
  },
};

export function setup() {
  return fetchCatalogue();
}

export default function (data) {
  browse(data);
  search(data);
  shop(data);
  account();
}
