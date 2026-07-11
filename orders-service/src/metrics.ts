import http from 'http';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger';

export const register = new Registry();
collectDefaultMetrics({ register });

export const grpcRequestsTotal = new Counter({
  name: 'grpc_requests_total',
  help: 'Total gRPC requests',
  labelNames: ['method', 'status'] as const,
  registers: [register],
});

export const grpcRequestDuration = new Histogram({
  name: 'grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds',
  labelNames: ['method'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
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
