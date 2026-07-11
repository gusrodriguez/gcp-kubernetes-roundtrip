import http from 'http';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger';

export const register = new Registry();
collectDefaultMetrics({ register });

export const messagesProcessed = new Counter({
  name: 'messages_processed_total',
  help: 'Total messages processed',
  labelNames: ['status'] as const,
  registers: [register],
});

export const processingDuration = new Histogram({
  name: 'processing_duration_seconds',
  help: 'Message processing duration in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const dlqTotal = new Counter({
  name: 'dlq_messages_total',
  help: 'Total messages sent to DLQ',
  registers: [register],
});

export const ordersTotal = new Counter({
  name: 'orders_total',
  help: 'Total orders by status transition',
  labelNames: ['status'] as const,
  registers: [register],
});

export function startMetricsServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else if (req.url === '/healthz') {
      res.writeHead(200);
      res.end('ok');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Metrics server listening');
  });

  return server;
}
