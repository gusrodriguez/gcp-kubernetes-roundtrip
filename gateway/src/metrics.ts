import http from 'http';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger';

export const register = new Registry();
collectDefaultMetrics({ register });

export const graphqlRequestsTotal = new Counter({
  name: 'graphql_requests_total',
  help: 'Total GraphQL requests',
  labelNames: ['operation', 'status'] as const,
  registers: [register],
});

export const graphqlRequestDuration = new Histogram({
  name: 'graphql_request_duration_seconds',
  help: 'GraphQL request duration in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
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
