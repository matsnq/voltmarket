const { authenticator } = require('otplib');

// Requiring the service applies its TOTP options (clock-skew window).
require('../../src/modules/auth/auth.service');

const secret = authenticator.generateSecret();

describe('TOTP verification window', () => {
  test('accepts the current code', () => {
    expect(authenticator.check(authenticator.generate(secret), secret)).toBe(true);
  });

  test('accepts a code from the previous 30-second step (typed as it rolled over)', () => {
    const previous = authenticator.clone({ epoch: Date.now() - 30_000 }).generate(secret);
    expect(authenticator.check(previous, secret)).toBe(true);
  });

  test('accepts a code from the next step (phone clock running slightly fast)', () => {
    const next = authenticator.clone({ epoch: Date.now() + 30_000 }).generate(secret);
    expect(authenticator.check(next, secret)).toBe(true);
  });

  test('rejects a stale code beyond the tolerance window', () => {
    const stale = authenticator.clone({ epoch: Date.now() - 300_000 }).generate(secret);
    expect(authenticator.check(stale, secret)).toBe(false);
  });

  test('rejects a wrong code', () => {
    expect(authenticator.check('000000', secret)).toBe(false);
  });
});
