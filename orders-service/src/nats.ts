import { connect, headers, NatsConnection, JetStreamClient, JetStreamManager, StorageType, StringCodec } from 'nats';
import { logger } from './logger';

let nc: NatsConnection;
let js: JetStreamClient;

const sc = StringCodec();

export async function connectNats(): Promise<void> {
  const servers = process.env.NATS_URL || 'nats://localhost:4222';
  nc = await connect({ servers });
  logger.info({ servers }, 'Connected to NATS');

  const jsm: JetStreamManager = await nc.jetstreamManager();

  // Ensure ORDERS stream exists (subjects: orders.*, file storage)
  try {
    await jsm.streams.info('ORDERS');
    logger.info('ORDERS stream already exists');
  } catch {
    await jsm.streams.add({
      name: 'ORDERS',
      subjects: ['orders.*'],
      storage: StorageType.File,
    });
    logger.info('Created ORDERS stream');
  }

  // Ensure DLQ stream exists
  try {
    await jsm.streams.info('DLQ');
    logger.info('DLQ stream already exists');
  } catch {
    await jsm.streams.add({
      name: 'DLQ',
      subjects: ['dlq.orders'],
      storage: StorageType.File,
    });
    logger.info('Created DLQ stream');
  }

  js = nc.jetstream();
}

export async function publishOrderCreated(
  orderId: string,
  correlationId: string,
  payload: { customerEmail: string; item: string; quantity: number },
): Promise<void> {
  const data = JSON.stringify({ orderId, correlationId, ...payload });
  await js.publish('orders.created', sc.encode(data), {
    headers: (() => {
      const h = headers();
      h.set('Nats-Correlation-Id', correlationId);
      return h;
    })(),
    msgID: orderId, // Deduplication: same order ID won't publish twice
  });
  logger.info({ orderId, correlationId }, 'Published orders.created');
}

export async function drainNats(): Promise<void> {
  if (nc) {
    await nc.drain();
    logger.info('NATS connection drained');
  }
}
