const amqp = require('amqplib');
const config = require('../config');

const EXCHANGE = 'shop.events';
const QUEUES = {
  paymentStatus: 'payment.status',
  deadLetter: 'shop.dead-letter',
};

let connection = null;
let channel = null;
let connecting = null;

// Declares the exchange, the work queue and its dead-letter queue. A message
// that is nacked (after retries) lands in shop.dead-letter instead of looping
// forever — that is the "message queue reliability" requirement.
async function assertTopology(ch) {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(QUEUES.deadLetter, { durable: true });
  await ch.assertQueue(QUEUES.paymentStatus, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: QUEUES.deadLetter,
  });
  await ch.bindQueue(QUEUES.paymentStatus, EXCHANGE, 'payment.*');
}

async function getChannel() {
  if (channel) return channel;
  if (!connecting) {
    connecting = (async () => {
      connection = await amqp.connect(config.rabbitmqUrl);
      connection.on('close', () => {
        channel = null;
        connection = null;
        connecting = null;
      });
      connection.on('error', () => {});
      const ch = await connection.createConfirmChannel();
      await assertTopology(ch);
      channel = ch;
      return ch;
    })().catch((err) => {
      connecting = null;
      throw err;
    });
  }
  return connecting;
}

// Durable publish with publisher confirms: the promise resolves only once
// RabbitMQ has accepted responsibility for the message.
async function publish(routingKey, payload) {
  const ch = await getChannel();
  return new Promise((resolve, reject) => {
    ch.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json' },
      (err) => (err ? reject(err) : resolve(true))
    );
  });
}

async function close() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch {
    /* shutting down anyway */
  }
  channel = null;
  connection = null;
  connecting = null;
}

module.exports = { EXCHANGE, QUEUES, getChannel, assertTopology, publish, close };
