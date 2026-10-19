// One fixed arrival rate per run, so each run is a single clean data point:
// "at N requests per second, the 95th percentile was X and E% failed".
//
//   THINK=0 RATE=600 k6 run load-tests/rate.js
//
// The ramp in capacity.js finds roughly where the platform gives out; this
// pins down the number either side of it.
import { browse, search, shop, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    fixed: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 300),
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 200),
      maxVUs: Number(__ENV.MAX_VUS || 2000),
      exec: 'mixed',
    },
  },
};

export function setup() {
  return fetchCatalogue();
}

export function mixed(data) {
  const r = Math.random();
  if (r < 0.65) browse(data);
  else if (r < 0.88) search(data);
  else shop(data);
}
