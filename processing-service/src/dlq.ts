import { NatsConnection, JetStreamManager, JetStreamClient, StorageType, StringCodec } from 'nats';
import { logger } from './logger';
import { dlqTotal } from './metrics';

const sc = StringCodec();

// Dead-letter pattern using JetStream advisories.
//
// Unlike Azure Service Bus which has built-in dead-lettering (move to a DLQ
// sub-queue after N delivery attempts), NATS JetStream gives you the primitives
// to build it yourself. When a message exceeds maxDeliver attempts, JetStream
// publishes an advisory to $JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.<stream>.<consumer>.
// We subscribe to that advisory, fetch the exhausted message by its stream
// sequence number, and republish it to a DLQ stream for manual inspection.
export async function startDlqHandler(nc: NatsConnection): Promise<void> {
  const jsm: JetStreamManager = await nc.jetstreamManager();
  const js: JetStreamClient = nc.jetstream();

  // Ensure DLQ stream exists
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

  // Subscribe to max delivery advisories for all consumers on the ORDERS stream
  const advisorySubject = '$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.ORDERS.*';
  const sub = nc.subscribe(advisorySubject);

  logger.info({ subject: advisorySubject }, 'DLQ handler listening for max delivery advisories');

  for await (const msg of sub) {
    try {
      const advisory = JSON.parse(sc.decode(msg.data));
      const streamSeq: number = advisory.stream_seq;
      const stream: string = advisory.stream;

      logger.warn({ streamSeq, stream, advisory }, 'Max deliveries exceeded, moving to DLQ');

      // Fetch the original message by stream sequence
      const jsm2 = await nc.jetstreamManager();
      const originalMsg = await jsm2.streams.getMessage(stream, { seq: streamSeq });

      if (originalMsg) {
        // Republish to DLQ stream with original data and headers
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
