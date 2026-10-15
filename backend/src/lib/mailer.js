const nodemailer = require('nodemailer');
const config = require('../config');

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false, // Mailpit in dev; swap for a real provider + TLS in production
});

// Two kinds of caller, two correct behaviours:
//
//   - Request path (welcome, password reset): a dead mail server must not
//     fail the user's request, so failures are logged and swallowed.
//   - Queue worker (order confirmations): the message *must not* be
//     acknowledged if the email never went, so failures have to propagate and
//     let the retry/dead-letter machinery do its job.
//
// The previous version always swallowed, while its own comment claimed order
// emails were retried through the queue. They were not — a failed send was
// lost silently. `required: true` is what makes that comment true.
async function sendMail({ to, subject, html, text, required = false }) {
  if (process.env.NODE_ENV === 'test') return;
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (err) {
    console.error('[mailer]', err.message);
    if (required) throw new Error(`Could not send "${subject}" to ${to}: ${err.message}`);
  }
}

function layout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="color:#0d4a9c;margin-bottom:4px">⚡ Voltmarket</h2>
    <h3 style="margin-top:0">${title}</h3>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="font-size:12px;color:#6b7280">Voltmarket — electric cars &amp; EV gear. This is a course project; no real orders are fulfilled.</p>
  </div>`;
}

module.exports = { sendMail, layout };
