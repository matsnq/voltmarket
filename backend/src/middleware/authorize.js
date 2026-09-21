const db = require('../lib/db');
const { HttpError } = require('./errorHandler');

// Role-based access control. Re-reads the user so role changes and
// deactivation take effect immediately (not only at next token refresh), and
// enforces the "all admins must have 2FA enabled" rule.
function authorize(...roles) {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new HttpError(401, 'Authentication required');
      const user = await db('users').where({ id: req.user.id }).first();
      if (!user || !user.is_active) throw new HttpError(403, 'Account is disabled');
      if (roles.length && !roles.includes(user.role)) {
        throw new HttpError(403, 'Insufficient permissions');
      }
      if (user.role === 'admin' && !user.totp_enabled) {
        throw new HttpError(403, 'Admins must enable two-factor authentication first', {
          code: 'ADMIN_2FA_REQUIRED',
        });
      }
      req.user.role = user.role;
      req.dbUser = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authorize };
