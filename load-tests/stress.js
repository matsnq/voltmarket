// Breaking-point run: ramp until the platform stops meeting its targets.
//
//   k6 run load-tests/stress.js
//
// Thresholds are deliberately absent — this run is supposed to fail. What it
// produces is the number the report needs: the concurrency at which the 95th
// percentile crosses five seconds.
import { browse, search, shop, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 10,
      exec: 'mixed',
      // Two minutes at each step: long enough for queues and the connection
      // pool to reach a steady state rather than absorbing a burst.
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 400 },
        { duration: '2m', target: 400 },
        { duration: '30s', target: 0 },
      ],
    },
  },
};

export function setup() {
  return fetchCatalogue();
}

// One weighted mix rather than separate scenarios, so the VU count on the
// x-axis means "concurrent users" and nothing else.
export function mixed(data) {
  const r = Math.random();
  if (r < 0.65) browse(data);
  else if (r < 0.88) search(data);
  else shop(data);
}
