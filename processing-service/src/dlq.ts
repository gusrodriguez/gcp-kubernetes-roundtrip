import { NatsConnection, JetStreamManager, JetStreamClient, StorageType, StringCodec } from 'nats';
import { logger } from './logger';
import { dlqTotal } from './metrics';

const sc = StringCodec();

export async function startDlqHandler(nc: NatsConnection): Promise<void> {
  const jsm: JetStreamManager = await nc.jetstreamManager();
  const js: JetStreamClient = nc.jetstream();

  try {
    await jsm.streams.info('DLQ');
  } catch {
    await jsm.streams.add({
      name: 'DLQ',
      subjects: ['dlq.orders'],
      storage: StorageType.File,
    });
    logger.info('Created DLQ stream');
  }

  const advisorySubject = '$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.ORDERS.*';
  const sub = nc.subscribe(advisorySubject);

  logger.info({ subject: advisorySubject }, 'DLQ handler listening for max delivery advisories');

  for await (const msg of sub) {
    try {
      const advisory = JSON.parse(sc.decode(msg.data));
      const streamSeq: number = advisory.stream_seq;
      const stream: string = advisory.stream;

      logger.warn({ streamSeq, stream, advisory }, 'Max deliveries exceeded, moving to DLQ');

      const jsm2 = await nc.jetstreamManager();
      const originalMsg = await jsm2.streams.getMessage(stream, { seq: streamSeq });

      if (originalMsg) {
        await js.publish('dlq.orders', originalMsg.data, {
          headers: originalMsg.header || undefined,
        });
        dlqTotal.inc();
        logger.info({ streamSeq }, 'Message republished to DLQ');
      } else {
        logger.warn({ streamSeq }, 'Could not fetch original message for DLQ');
      }
    } catch (err) {
      logger.error({ err }, 'DLQ handler error');
    }
  }
}
