import { Pool } from 'pg';
import { logger } from './logger';

// Long-lived connection pool — the serverfull luxury. Unlike serverless functions
// that must establish (and often exhaust) connections on every cold start, this pool
// stays warm for the lifetime of the process, amortising connection setup cost to zero.
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'roundtrip',
  user: process.env.PGUSER || 'roundtrip',
  password: process.env.PGPASSWORD || 'roundtrip',
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

export { pool };

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_correlation_id ON orders (correlation_id);
`;

export async function runMigrations(): Promise<void> {
  await pool.query(MIGRATION_SQL);
  logger.info('Database migrations applied');
}

export interface OrderRow {
  id: string;
  correlation_id: string;
  payload: { customerEmail: string; item: string; quantity: number };
  status: string;
  created_at: Date;
  processed_at: Date | null;
}

export async function insertOrder(
  id: string,
  correlationId: string,
  payload: { customerEmail: string; item: string; quantity: number },
): Promise<OrderRow> {
  const result = await pool.query<OrderRow>(
    `INSERT INTO orders (id, correlation_id, payload, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [id, correlationId, JSON.stringify(payload)],
  );
  return result.rows[0];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const result = await pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function listOrders(limit: number): Promise<OrderRow[]> {
  const result = await pool.query<OrderRow>(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1',
    [Math.min(limit || 50, 100)],
  );
  return result.rows;
}
