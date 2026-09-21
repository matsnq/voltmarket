const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const db = require('../../lib/db');
const redis = require('../../lib/redis');
const config = require('../../config');
const { HttpError } = require('../../middleware/errorHandler');
const { verifyCaptcha } = require('../../lib/recaptcha');
const { sendMail, layout } = require('../../lib/mailer');
const { encryptField, decryptField, sha256, randomToken } = require('../../lib/crypto');
const tokens = require('./token.service');

const BCRYPT_ROUNDS = 10;

// TOTP codes change every 30 s. Accept one step either side so a code typed
// as it rolls over — or a phone whose clock drifts slightly — still works.
// RFC 6238 §5.2 explicitly allows this; the trade-off is a 90 s validity
// window per code instead of 30 s.
authenticator.options = { window: [1, 1] };

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone_enc ? decryptField(user.phone_enc) : null,
    emailVerified: user.email_verified,
    totpEnabled: user.totp_enabled,
    createdAt: user.created_at,
  };
}

async function issueTokenPair(user, req) {
  const accessToken = tokens.signAccessToken(user);
  const refreshToken = await tokens.issueRefreshToken(user.id, { req });
  return { accessToken, refreshToken };
}

// ---------- Registration ----------

async function register({ email, password, name, captchaToken }, req) {
  const captchaOk = await verifyCaptcha(captchaToken, req.ip);
  if (!captchaOk) throw new HttpError(400, 'CAPTCHA verification failed. Please try again.');

  const existing = await db('users').where({ email }).first();
  if (existing) throw new HttpError(409, 'An account with this email already exists. Try logging in instead.');

  const [user] = await db('users')
    .insert({
      email,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      name,
    })
    .returning('*');

  sendMail({
    to: email,
    subject: 'Welcome to Voltmarket ⚡',
    html: layout(
      `Welcome, ${name}!`,
      `<p>Your account is ready. Browse electric cars, chargers and accessories — and enjoy the ride.</p>
       <p><a href="${config.appUrl}" style="color:#0d4a9c">Start shopping →</a></p>`
    ),
  });

  const pair = await issueTokenPair(user, req);
  return { user: publicUser(user), ...pair };
}

// ---------- Login (email/password + optional TOTP) ----------

async function login({ email, password, otp }, req) {
  const user = await db('users').where({ email }).first();
  // Identical error for wrong email vs wrong password — no account enumeration.
  const invalid = new HttpError(401, 'Invalid email or password');
  if (!user || !user.password_hash || !user.is_active) throw invalid;

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw invalid;

  if (user.totp_enabled) {
    if (!otp) throw new HttpError(401, 'Two-factor code required', { code: '2FA_REQUIRED' });
    verifyOtpOrRecovery(user, otp); // throws on failure
    if (/^[a-f0-9]{10}$/i.test(otp)) await consumeRecoveryCode(user, otp);
  }

  const pair = await issueTokenPair(user, req);
  return {
    user: publicUser(user),
    ...pair,
    // Admins are forced into 2FA enrollment before admin APIs work.
    requires2faSetup: user.role === 'admin' && !user.totp_enabled,
  };
}

function verifyOtpOrRecovery(user, otp) {
  if (/^[0-9]{6}$/.test(otp)) {
    const secret = decryptField(user.totp_secret_enc);
    if (!secret || !authenticator.check(otp, secret)) {
      throw new HttpError(401, 'Invalid two-factor code', { code: '2FA_INVALID' });
    }
    return;
  }
  const codes = user.totp_recovery_codes || [];
  if (!codes.includes(sha256(otp.toLowerCase()))) {
    throw new HttpError(401, 'Invalid recovery code', { code: '2FA_INVALID' });
  }
}

async function consumeRecoveryCode(user, otp) {
  const remaining = (user.totp_recovery_codes || []).filter(
    (h) => h !== sha256(otp.toLowerCase())
  );
  await db('users')
    .where({ id: user.id })
    .update({ totp_recovery_codes: JSON.stringify(remaining) });
}

// ---------- Refresh & logout ----------

async function refresh(rawRefreshToken, req) {
  const { userId, refreshToken } = await tokens.rotateRefreshToken(rawRefreshToken, req);
  const user = await db('users').where({ id: userId }).first();
  if (!user || !user.is_active) throw new HttpError(401, 'Account is disabled');
  return { user: publicUser(user), accessToken: tokens.signAccessToken(user), refreshToken };
}

async function logout(rawRefreshToken, accessPayload) {
  await tokens.revokeRefreshToken(rawRefreshToken);
  if (accessPayload) await tokens.revokeAccessToken(accessPayload);
}

async function logoutAll(userId, accessPayload) {
  await tokens.revokeAllForUser(userId);
  if (accessPayload) await tokens.revokeAccessToken(accessPayload);
}

// ---------- Password recovery ----------

async function requestPasswordReset(email) {
  const user = await db('users').where({ email }).first();
  // Always report success — no account enumeration via this endpoint.
  if (!user || !user.password_hash) return;

  const raw = randomToken(48);
  await db('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: sha256(raw),
    expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });

  const link = `${config.appUrl}/reset-password?token=${raw}`;
  sendMail({
    to: email,
    subject: 'Reset your Voltmarket password',
    html: layout(
      'Password reset',
      `<p>Someone (hopefully you) requested a password reset. The link is valid for 1 hour and can be used once.</p>
       <p><a href="${link}" style="color:#0d4a9c">Choose a new password →</a></p>
       <p>If this wasn't you, you can safely ignore this email.</p>`
    ),
  });
}

async function resetPassword(rawToken, newPassword) {
  const row = await db('password_reset_tokens')
    .where({ token_hash: sha256(rawToken) })
    .first();
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  await db.transaction(async (trx) => {
    const claimed = await trx('password_reset_tokens')
      .where({ id: row.id })
      .whereNull('used_at')
      .update({ used_at: trx.fn.now() });
    if (!claimed) throw new HttpError(400, 'This reset link has already been used.');
    await trx('users')
      .where({ id: row.user_id })
      .update({ password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
  });

  // New password invalidates every existing session.
  await tokens.revokeAllForUser(row.user_id);
}

// ---------- Two-factor authentication (TOTP) ----------

async function setup2fa(userId) {
  const user = await db('users').where({ id: userId }).first();
  if (user.totp_enabled) throw new HttpError(409, 'Two-factor authentication is already enabled');

  const secret = authenticator.generateSecret();
  await db('users').where({ id: userId }).update({ totp_secret_enc: encryptField(secret) });

  const otpauth = authenticator.keyuri(user.email, 'Voltmarket', secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth);
  return { secret, otpauth, qrDataUrl };
}

async function enable2fa(userId, otp) {
  const user = await db('users').where({ id: userId }).first();
  const secret = user.totp_secret_enc ? decryptField(user.totp_secret_enc) : null;
  if (!secret) throw new HttpError(400, 'Start 2FA setup first');
  if (!authenticator.check(otp, secret)) {
    throw new HttpError(400, 'The code does not match. Check your authenticator app and try again.');
  }

  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  await db('users')
    .where({ id: userId })
    .update({
      totp_enabled: true,
      totp_recovery_codes: JSON.stringify(recoveryCodes.map((c) => sha256(c))),
    });
  return { recoveryCodes }; // shown exactly once
}

async function disable2fa(userId, otp) {
  const user = await db('users').where({ id: userId }).first();
  if (!user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is not enabled');
  if (user.role === 'admin') {
    throw new HttpError(403, 'Admins are required to keep two-factor authentication enabled');
  }
  verifyOtpOrRecovery(user, otp);
  await db('users')
    .where({ id: userId })
    .update({ totp_enabled: false, totp_secret_enc: null, totp_recovery_codes: null });
  await tokens.revokeAllForUser(userId);
}

// ---------- Google OAuth 2.0 (authorization code flow) ----------

function googleConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

function googleRedirectUri() {
  return `${config.appUrl}/api/v1/auth/google/callback`;
}

async function googleAuthUrl() {
  if (!googleConfigured()) {
    throw new HttpError(503, 'Google sign-in is not configured on this server');
  }
  const state = randomToken(16);
  await redis.set(`oauth:state:${state}`, '1', 'EX', 600);
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function googleCallback({ code, state }, req) {
  if (!googleConfigured()) throw new HttpError(503, 'Google sign-in is not configured');
  const known = await redis.del(`oauth:state:${state}`);
  if (known !== 1) throw new HttpError(400, 'Invalid OAuth state — please retry the sign-in');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new HttpError(502, 'Google token exchange failed');
  const tokenData = await tokenRes.json();

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!infoRes.ok) throw new HttpError(502, 'Could not fetch Google profile');
  const profile = await infoRes.json(); // { sub, email, email_verified, name }

  let user;
  const linked = await db('oauth_accounts')
    .where({ provider: 'google', provider_user_id: profile.sub })
    .first();

  if (linked) {
    user = await db('users').where({ id: linked.user_id }).first();
  } else {
    user = await db('users').where({ email: (profile.email || '').toLowerCase() }).first();
    await db.transaction(async (trx) => {
      if (!user) {
        [user] = await trx('users')
          .insert({
            email: profile.email.toLowerCase(),
            name: profile.name || profile.email.split('@')[0],
            email_verified: Boolean(profile.email_verified),
          })
          .returning('*');
      }
      await trx('oauth_accounts').insert({
        user_id: user.id,
        provider: 'google',
        provider_user_id: profile.sub,
      });
    });
  }

  if (!user.is_active) throw new HttpError(403, 'Account is disabled');
  const pair = await issueTokenPair(user, req);
  return { user: publicUser(user), ...pair };
}

// ---------- Profile ----------

async function getProfile(userId) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new HttpError(404, 'User not found');
  return publicUser(user);
}

async function updateProfile(userId, { name, phone }) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone_enc = phone === null ? null : encryptField(phone);
  if (Object.keys(patch).length) {
    patch.updated_at = db.fn.now();
    await db('users').where({ id: userId }).update(patch);
  }
  return getProfile(userId);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  requestPasswordReset,
  resetPassword,
  setup2fa,
  enable2fa,
  disable2fa,
  googleAuthUrl,
  googleCallback,
  googleConfigured,
  getProfile,
  updateProfile,
  publicUser,
};
