// One concurrency level at a time, so each run yields a single clean data
// point: "at N concurrent users, the 95th percentile was X".
//
//   VUS=100 DURATION=90s k6 run load-tests/step.js
//
// A ramp would be faster to run but its end-of-run summary averages every
// level together, which cannot answer "how many users before responses
// exceed five seconds".
import { browse, search, shop, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    step: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '90s',
      exec: 'mixed',
      gracefulStop: '20s',
    },
  },
  // No thresholds: at the top of the ramp this run is meant to fail, and a
  // failed threshold would only obscure the number we came for.
};

export function setup() {
  return fetchCatalogue();
}

// The same weighted mix at every level, so the only variable is concurrency.
export function mixed(data) {
  const r = Math.random();
  if (r < 0.65) browse(data);
  else if (r < 0.88) search(data);
  else shop(data);
}
