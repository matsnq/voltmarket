const { encryptField } = require('../src/lib/crypto');

// Two messages so the support inbox is not empty on a fresh install: one
// waiting to be picked up, one already closed, which is enough to show the
// status filter doing something.
const MESSAGES = [
  {
    name: 'Kristjan Oja',
    email: 'kristjan.oja@example.com',
    topic: 'order',
    subject: 'Delivery window for my wallbox',
    body: 'I ordered a Wallbox Pulsar Max on Monday and would like to know whether I can choose a delivery day. I work from home on Thursdays, which would be easiest.',
    status: 'new',
  },
  {
    name: 'Helena Mets',
    email: 'helena.mets@example.com',
    topic: 'product',
    subject: 'Which charger for a single-phase house?',
    body: 'Our house only has a single-phase connection. Does the 11 kW wallbox still work, or should I be looking at the 7.4 kW one instead?',
    status: 'closed',
  },
];

exports.seed = async function seed(knex) {
  for (const m of MESSAGES) {
    const existing = await knex('contact_messages').where({ subject: m.subject }).first();
    if (existing) continue;
    await knex('contact_messages').insert({
      name: m.name,
      email_enc: encryptField(m.email),
      body_enc: encryptField(m.body),
      subject: m.subject,
      topic: m.topic,
      status: m.status,
      ...(m.status === 'closed' ? { handled_at: knex.fn.now() } : {}),
    });
  }
};
