const config = require('../../config');
const service = require('./auth.service');
const tokens = require('./token.service');

// The access token travels in the JSON body (the SPA keeps it in memory only);
// the refresh token travels in an httpOnly cookie scoped to /api/v1/auth.

async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.register(req.validated.body, req);
    tokens.setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken, requires2faSetup } = await service.login(
      req.validated.body,
      req
    );
    tokens.setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken, requires2faSetup });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const raw = req.cookies[tokens.REFRESH_COOKIE];
    const { user, accessToken, refreshToken } = await service.refresh(raw, req);
    tokens.setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    tokens.clearRefreshCookie(res);
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await service.logout(req.cookies[tokens.REFRESH_COOKIE], req.user);
    tokens.clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    await service.logoutAll(req.user.id, req.user);
    tokens.clearRefreshCookie(res);
    res.json({ message: 'All sessions revoked' });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    await service.requestPasswordReset(req.validated.body.email);
    res.json({ message: 'If that email exists, a reset link is on its way.' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.validated.body;
    await service.resetPassword(token, password);
    res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

async function setup2fa(req, res, next) {
  try {
    res.json(await service.setup2fa(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function enable2fa(req, res, next) {
  try {
    res.json(await service.enable2fa(req.user.id, req.validated.body.otp));
  } catch (err) {
    next(err);
  }
}

async function disable2fa(req, res, next) {
  try {
    await service.disable2fa(req.user.id, req.validated.body.otp);
    res.json({ message: 'Two-factor authentication disabled' });
  } catch (err) {
    next(err);
  }
}

async function googleStart(req, res, next) {
  try {
    res.redirect(await service.googleAuthUrl());
  } catch (err) {
    next(err);
  }
}

async function googleCallback(req, res, next) {
  try {
    const { refreshToken } = await service.googleCallback(req.query, req);
    tokens.setRefreshCookie(res, refreshToken);
    // The SPA calls POST /auth/refresh on load to pick up its access token.
    res.redirect(`${config.appUrl}/?oauth=success`);
  } catch (err) {
    console.error('[oauth]', err.message);
    res.redirect(`${config.appUrl}/login?oauth=failed`);
  }
}

async function me(req, res, next) {
  try {
    res.json({ user: await service.getProfile(req.user.id) });
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    res.json({ user: await service.updateProfile(req.user.id, req.validated.body) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  setup2fa,
  enable2fa,
  disable2fa,
  googleStart,
  googleCallback,
  me,
  updateMe,
};
