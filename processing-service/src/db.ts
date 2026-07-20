import { Pool } from 'pg';
import { logger } from './logger';

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

export async function markOrderProcessed(orderId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE orders
     SET status = 'processed', processed_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [orderId],
  );
  return (result.rowCount ?? 0) > 0;
}
