import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { schema } from './schema';
import { startMetricsServer } from './metrics';
import { logger } from './logger';

const PORT = parseInt(process.env.PORT || '4000', 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9092', 10);

const yoga = createYoga({
  schema,
  logging: {
    debug: (...args) => logger.debug(args),
    info: (...args) => logger.info(args),
    warn: (...args) => logger.warn(args),
    error: (...args) => logger.error(args),
  },
  graphiql: true,
});

const server = createServer(yoga);

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Gateway (GraphQL) server listening');
});

const metricsServer = startMetricsServer(METRICS_PORT);

async function shutdown() {
  logger.info('Shutting down...');
  server.close();
  metricsServer.close();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
