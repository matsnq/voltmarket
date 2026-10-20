const fs = require('fs');
const path = require('path');

// dotenv resolves a bare `.env` against the *working directory*, so running
// `pnpm dev` or `npx knex` from backend/ silently missed the `.env` at the
// repository root. The API then started with no Stripe keys and Google
// sign-in switched off, which reads as a broken integration rather than as a
// file that was never loaded. In Docker it worked, because compose passes the
// variables in directly — so the failure only appeared in local development.
//
// Resolve against this file instead of the cwd, and accept either location.
// dotenv does not overwrite variables that are already set, so precedence
// runs: real environment (what compose provides) > backend/.env > root .env.
const CANDIDATES = [
  path.resolve(__dirname, '..', '..', '.env'), // backend/.env
  path.resolve(__dirname, '..', '..', '..', '.env'), // repository root
];

const loaded = [];
for (const file of CANDIDATES) {
  if (fs.existsSync(file)) {
    require('dotenv').config({ path: file });
    loaded.push(file);
  }
}

module.exports = { loaded };
