const db = require('../../lib/db');
const { encryptField, decryptField } = require('../../lib/crypto');
const { sendMail, layout } = require('../../lib/mailer');
const { HttpError } = require('../../middleware/errorHandler');
const config = require('../../config');

const TOPIC_LABELS = {
  order: 'An order',
  product: 'A product',
  returns: 'Returns or refunds',
  technical: 'Something is broken',
  other: 'Something else',
};

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    email: decryptField(row.email_enc),
    topic: row.topic,
    topicLabel: TOPIC_LABELS[row.topic] || row.topic,
    subject: row.subject,
    message: decryptField(row.body_enc),
    orderReference: row.order_reference,
    status: row.status,
    fromAccount: Boolean(row.user_id),
    handledBy: row.handler_name || null,
    handledAt: row.handled_at,
    receivedAt: row.created_at,
  };
}

// Store first, then notify. If the mail server is down the message is still
// in the database and shows up in the support inbox — losing a customer's
// question because SMTP hiccuped would be the worst possible failure here.
async function submit(payload, userId = null) {
  const [row] = await db('contact_messages')
    .insert({
      user_id: userId,
      name: payload.name,
      email_enc: encryptField(payload.email),
      body_enc: encryptField(payload.message),
      subject: payload.subject,
      topic: payload.topic,
      order_reference: payload.orderReference || null,
    })
    .returning('*');

  const details = [
    `<p><strong>From:</strong> ${payload.name} &lt;${payload.email}&gt;</p>`,
    `<p><strong>About:</strong> ${TOPIC_LABELS[payload.topic]}</p>`,
    payload.orderReference ? `<p><strong>Order:</strong> ${payload.orderReference}</p>` : '',
    `<p style="white-space:pre-line">${payload.message.replace(/</g, '&lt;')}</p>`,
  ].join('');

  // Not `required` — the customer's request must succeed either way, and the
  // row above is the durable copy.
  await sendMail({
    to: config.smtp.supportInbox,
    subject: `[Support] ${payload.subject}`,
    html: layout('New message from the contact form', details),
    text: `${payload.name} <${payload.email}>\n${payload.subject}\n\n${payload.message}`,
  });

  await sendMail({
    to: payload.email,
    subject: 'We received your message — Voltmarket',
    html: layout(
      'Thanks for getting in touch',
      `<p>Hi ${payload.name}, we have your message and aim to reply within one working day.</p>
       <p><strong>${payload.subject}</strong></p>
       <p style="white-space:pre-line;color:#6b7280">${payload.message.replace(/</g, '&lt;')}</p>`
    ),
    text: `Hi ${payload.name}, we have your message and aim to reply within one working day.`,
  });

  return { id: row.id, receivedAt: row.created_at };
}

async function list({ status, page = 1, perPage = 20 } = {}) {
  const base = () => {
    const q = db('contact_messages');
    if (status) q.where('contact_messages.status', status);
    return q;
  };
  const [{ count }] = await base().count('* as count');
  const rows = await base()
    .leftJoin('users', 'users.id', 'contact_messages.handled_by')
    .select('contact_messages.*', 'users.name as handler_name')
    .orderBy('contact_messages.created_at', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    messages: rows.map(serialize),
    total: Number(count),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(Number(count) / perPage)),
  };
}

async function updateStatus(id, status, staffId) {
  return db.transaction(async (trx) => {
    const existing = await trx('contact_messages').where({ id }).first();
    if (!existing) throw new HttpError(404, 'Message not found');

    const [row] = await trx('contact_messages')
      .where({ id })
      .update({
        status,
        handled_by: staffId,
        handled_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');

    await trx('audit_logs').insert({
      user_id: staffId,
      action: `contact.${status}`,
      entity: 'contact_messages',
      entity_id: id,
      meta: JSON.stringify({ from: existing.status, to: status }),
    });

    return serialize(row);
  });
}

module.exports = { submit, list, updateStatus, TOPIC_LABELS };
