import * as grpc from '@grpc/grpc-js';
import { createGrpcServer } from './server';
import { runMigrations, pool } from './db';
import { connectNats, drainNats } from './nats';
import { startMetricsServer } from './metrics';
import { logger } from './logger';

const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9090', 10);

async function main() {
  await runMigrations();
  await connectNats();

  const grpcServer = createGrpcServer();
  grpcServer.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err) => {
      if (err) {
        logger.fatal({ err }, 'Failed to bind gRPC server');
        process.exit(1);
      }
      logger.info({ port: GRPC_PORT }, 'gRPC server listening');
    },
  );

  const metricsServer = startMetricsServer(METRICS_PORT);

  async function shutdown() {
    logger.info('Shutting down...');
    grpcServer.tryShutdown(async () => {
      await drainNats();
      metricsServer.close();
      await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
