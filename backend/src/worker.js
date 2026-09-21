// Queue worker entrypoint. Project 2 adds the real consumers (order status
// updates, confirmation emails, inventory adjustments); for now it connects to
// RabbitMQ with retry and declares the topology so the queues exist early.
const amqp = require('amqplib');
const config = require('./config');

const EXCHANGE = 'shop.events';
const QUEUES = {
  paymentStatus: 'payment.status',
  deadLetter: 'shop.dead-letter',
};

async function connectWithRetry(attempt = 1) {
  try {
    const conn = await amqp.connect(config.rabbitmqUrl);
    const channel = await conn.createChannel();

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(QUEUES.deadLetter, { durable: true });
    await channel.assertQueue(QUEUES.paymentStatus, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: QUEUES.deadLetter,
    });
    await channel.bindQueue(QUEUES.paymentStatus, EXCHANGE, 'payment.*');

    console.log('[worker] connected, queue topology declared');

    conn.on('close', () => {
      console.error('[worker] connection closed, reconnecting…');
      setTimeout(() => connectWithRetry(), 2000);
    });
  } catch (err) {
    const delay = Math.min(attempt * 1000, 10000);
    console.error(`[worker] connect failed (${err.message}), retry in ${delay}ms`);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
}

connectWithRetry();
