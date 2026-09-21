const { HttpError } = require('./errorHandler');
const tokenService = require('../modules/auth/token.service');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authentication required');
    }
    const token = header.slice(7);
    let payload;
    try {
      payload = tokenService.verifyAccessToken(token);
    } catch {
      throw new HttpError(401, 'Invalid or expired access token');
    }
    if (await tokenService.isAccessTokenRevoked(payload.jti)) {
      throw new HttpError(401, 'Token has been revoked');
    }
    req.user = { id: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Same as authenticate but lets anonymous requests through (guest carts etc.).
async function optionalAuth(req, res, next) {
  if (!(req.headers.authorization || '').startsWith('Bearer ')) return next();
  return authenticate(req, res, next);
}

module.exports = { authenticate, optionalAuth };
