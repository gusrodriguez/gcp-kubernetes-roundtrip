import { connect } from 'nats';
import { startConsumer } from './consumer';
import { startDlqHandler } from './dlq';
import { startMetricsServer } from './metrics';
import { pool } from './db';
import { logger } from './logger';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9091', 10);

async function main() {
  const nc = await connect({ servers: NATS_URL });
  logger.info({ servers: NATS_URL }, 'Connected to NATS');

  const metricsServer = startMetricsServer(METRICS_PORT);

  // Start DLQ handler alongside the main consumer
  startDlqHandler(nc).catch((err) => {
    logger.error({ err }, 'DLQ handler crashed');
  });

  // Start the main consumer (blocks until connection closes)
  await startConsumer(nc);

  async function shutdown() {
    logger.info('Shutting down...');
    await nc.drain();
    metricsServer.close();
    await pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
