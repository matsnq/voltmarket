const jwt = require('jsonwebtoken');
const tokens = require('../../src/modules/auth/token.service');
const config = require('../../src/config');

const user = { id: '11111111-1111-1111-1111-111111111111', role: 'customer', name: 'Unit Tester' };

describe('JWT access tokens', () => {
  test('generates a valid three-part JWT (header.payload.signature)', () => {
    const token = tokens.signAccessToken(user);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe('customer');
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.iss).toBe('voltmarket');
  });

  test('validates a token it signed', () => {
    const token = tokens.signAccessToken(user);
    const payload = tokens.verifyAccessToken(token);
    expect(payload.sub).toBe(user.id);
  });

  test('sets expiry according to configured TTL', () => {
    const token = tokens.signAccessToken(user);
    const payload = tokens.verifyAccessToken(token);
    const ttlSeconds = payload.exp - payload.iat;
    expect(ttlSeconds).toBe(config.jwt.accessTtlMin * 60);
  });

  test('rejects an expired token', () => {
    const expired = jwt.sign({ sub: user.id, jti: 'x' }, config.jwt.accessSecret, {
      expiresIn: '-1s',
      issuer: 'voltmarket',
    });
    expect(() => tokens.verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });

  test('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: user.id }, 'attacker-secret', { issuer: 'voltmarket' });
    expect(() => tokens.verifyAccessToken(forged)).toThrow();
  });

  test('rejects a tampered payload', () => {
    const token = tokens.signAccessToken(user);
    const [header, payload, sig] = token.split('.');
    const hacked = JSON.parse(Buffer.from(payload, 'base64url').toString());
    hacked.role = 'admin';
    const tampered = [
      header,
      Buffer.from(JSON.stringify(hacked)).toString('base64url'),
      sig,
    ].join('.');
    expect(() => tokens.verifyAccessToken(tampered)).toThrow();
  });

  test('revocation denylists the jti until natural expiry', async () => {
    const token = tokens.signAccessToken(user);
    const payload = tokens.verifyAccessToken(token);
    expect(await tokens.isAccessTokenRevoked(payload.jti)).toBe(false);
    await tokens.revokeAccessToken(payload);
    expect(await tokens.isAccessTokenRevoked(payload.jti)).toBe(true);
  });
});
