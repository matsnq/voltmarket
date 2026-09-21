const nodemailer = require('nodemailer');
const config = require('../config');

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false, // Mailpit in dev; swap for a real provider + TLS in production
});

async function sendMail({ to, subject, html, text }) {
  if (process.env.NODE_ENV === 'test') return; // no SMTP in unit/integration tests
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (err) {
    // Email failures must never take down a request; they are logged and
    // (for order events) retried through the message queue.
    console.error('[mailer]', err.message);
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
