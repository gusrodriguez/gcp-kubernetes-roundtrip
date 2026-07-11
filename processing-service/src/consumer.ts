import {
  NatsConnection,
  JetStreamClient,
  JetStreamManager,
  StringCodec,
  AckPolicy,
  DeliverPolicy,
  ConsumerConfig,
} from 'nats';
import { markOrderProcessed } from './db';
import { childLogger, logger } from './logger';
import { messagesProcessed, processingDuration, ordersTotal } from './metrics';

const sc = StringCodec();

export async function startConsumer(nc: NatsConnection): Promise<void> {
  const jsm: JetStreamManager = await nc.jetstreamManager();
  const js: JetStreamClient = nc.jetstream();

  // Ensure durable consumer exists
  const consumerConfig: Partial<ConsumerConfig> = {
    durable_name: 'processing-service',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: 'orders.created',
    max_deliver: 5,
  };

  try {
    await jsm.consumers.info('ORDERS', 'processing-service');
  } catch {
    await jsm.consumers.add('ORDERS', consumerConfig);
    logger.info('Created durable consumer processing-service');
  }

  const consumer = await js.consumers.get('ORDERS', 'processing-service');
  const messages = await consumer.consume();

  logger.info('Consumer started, waiting for messages...');

  for await (const msg of messages) {
    const end = processingDuration.startTimer();
    const data = JSON.parse(sc.decode(msg.data));
    const correlationId = msg.headers?.get('Nats-Correlation-Id') || data.correlationId || 'unknown';
    const log = childLogger(correlationId);

    try {
      log.info({ orderId: data.orderId, subject: msg.subject }, 'Processing order');

      // Simulate light work
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check for poison messages (item starts with "POISON")
      if (data.item && data.item.startsWith('POISON')) {
        throw new Error(`Poison message: cannot process item "${data.item}"`);
      }

      const updated = await markOrderProcessed(data.orderId);
      if (updated) {
        ordersTotal.inc({ status: 'processed' });
        log.info({ orderId: data.orderId }, 'Order processed');
      } else {
        log.info({ orderId: data.orderId }, 'Order already processed (idempotent skip)');
      }

      messagesProcessed.inc({ status: 'success' });
      msg.ack();
    } catch (err) {
      messagesProcessed.inc({ status: 'error' });
      log.error({ err, orderId: data.orderId }, 'Processing failed, will be redelivered');
      msg.nak();
    } finally {
      end();
    }
  }
}
