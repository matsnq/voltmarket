const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../lib/db');
const redis = require('../../lib/redis');
const config = require('../../config');
const { sha256, randomToken } = require('../../lib/crypto');
const { HttpError } = require('../../middleware/errorHandler');

const ISSUER = 'voltmarket';

// ---------- Access tokens (JWT: header.payload.signature) ----------

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, jti: crypto.randomUUID() },
    config.jwt.accessSecret,
    { expiresIn: `${config.jwt.accessTtlMin}m`, issuer: ISSUER }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: ISSUER });
}

// Access tokens are self-contained, so revocation uses a Redis denylist keyed
// by jti with TTL equal to the token's remaining lifetime.
async function revokeAccessToken(payload) {
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  if (remaining > 0) {
    await redis.set(`revoked:jti:${payload.jti}`, '1', 'EX', remaining);
  }
}

async function isAccessTokenRevoked(jti) {
  try {
    return (await redis.exists(`revoked:jti:${jti}`)) === 1;
  } catch {
    return false; // Redis outage: prefer availability, tokens expire in <=15min
  }
}

// ---------- Refresh tokens (opaque, stored hashed, rotated) ----------

async function issueRefreshToken(userId, { familyId, req, trx } = {}) {
  const raw = randomToken(48);
  await (trx || db)('refresh_tokens').insert({
    user_id: userId,
    token_hash: sha256(raw),
    family_id: familyId || crypto.randomUUID(),
    expires_at: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
    user_agent: (req && req.headers['user-agent'] || '').slice(0, 255) || null,
    ip: (req && req.ip) || null,
  });
  return raw;
}

// Rotation with single-use validation. Every refresh marks the presented
// token as used and issues a replacement in the same family. Presenting an
// already-used token is treated as theft: the whole family is revoked.
async function rotateRefreshToken(raw, req) {
  if (!raw) throw new HttpError(401, 'Refresh token missing');
  const row = await db('refresh_tokens').where({ token_hash: sha256(raw) }).first();
  if (!row) throw new HttpError(401, 'Invalid refresh token');

  if (row.revoked_at) throw new HttpError(401, 'Refresh token revoked');
  if (new Date(row.expires_at) < new Date()) throw new HttpError(401, 'Refresh token expired');

  if (row.used_at) {
    await revokeFamily(row.family_id);
    throw new HttpError(401, 'Refresh token reuse detected — all sessions in this chain were revoked');
  }

  // Atomic used_at claim; a concurrent double-spend loses the race and is
  // treated as reuse.
  const claimed = await db('refresh_tokens')
    .where({ id: row.id })
    .whereNull('used_at')
    .update({ used_at: db.fn.now() });
  if (!claimed) {
    await revokeFamily(row.family_id);
    throw new HttpError(401, 'Refresh token reuse detected — all sessions in this chain were revoked');
  }

  const newRaw = await issueRefreshToken(row.user_id, { familyId: row.family_id, req });
  return { userId: row.user_id, refreshToken: newRaw };
}

async function revokeFamily(familyId) {
  await db('refresh_tokens')
    .where({ family_id: familyId })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  await db('refresh_tokens')
    .where({ token_hash: sha256(raw) })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
}

async function revokeAllForUser(userId) {
  await db('refresh_tokens')
    .where({ user_id: userId })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
}

// ---------- Cookie helpers ----------

const REFRESH_COOKIE = 'refresh_token';

function setRefreshCookie(res, raw) {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth', // only sent to auth endpoints
    maxAge: config.jwt.refreshTtlDays * 86400000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  revokeAccessToken,
  isAccessTokenRevoked,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeFamily,
  revokeAllForUser,
  setRefreshCookie,
  clearRefreshCookie,
  REFRESH_COOKIE,
};
