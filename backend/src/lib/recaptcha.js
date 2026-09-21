const config = require('../config');

// Server-side reCAPTCHA verification. In the test environment Google is not
// called; the literal token 'invalid' fails and anything else passes, so both
// paths are covered deterministically and offline.
async function verifyCaptcha(token, ip) {
  if (config.env === 'test') return token !== 'invalid';
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: config.recaptchaSecret,
        response: token || '',
        remoteip: ip || '',
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[recaptcha]', err.message);
    return false; // fail closed — registration is not time-critical
  }
}

module.exports = { verifyCaptcha };
