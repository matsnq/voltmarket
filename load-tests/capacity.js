// Capacity test: how many requests per second can the platform actually
// serve, and what gives out first?
//
//   k6 run load-tests/capacity.js
//
// This one drives a fixed arrival rate with think time switched off. The
// journey tests cannot answer this question: their pacing is dominated by
// the 1-4 second pauses real shoppers take, so 400 virtual users generate
// only ~250 requests a second and the server never leaves idle. Here the
// rate is the independent variable and k6 adds virtual users as needed to
// sustain it.
import { browse, search, shop, fetchCatalogue } from './lib/flows.js';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    capacity: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      exec: 'mixed',
      stages: [
        { duration: '45s', target: 300 },
        { duration: '45s', target: 600 },
        { duration: '45s', target: 1000 },
        { duration: '45s', target: 1500 },
        { duration: '45s', target: 2000 },
      ],
    },
  },
  // Deliberately none: this run is supposed to break, and the number we want
  // is where it breaks.
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
