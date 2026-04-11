import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDb } from './db.js';
import { writeLog } from './lib/logger.js';
import settingsRoutes from './routes/settings.js';
import walletsRoutes from './routes/wallets.js';
import holdingsRoutes from './routes/holdings.js';
import transactionsRoutes from './routes/transactions.js';
import snapshotsRoutes from './routes/snapshots.js';
import stakingRoutes from './routes/staking.js';
import groupsRoutes from './routes/groups.js';
import heliusRoutes from './routes/helius.js';
import bitvavoRoutes from './routes/bitvavo.js';
import coingeckoRoutes from './routes/coingecko.js';
import logsRoutes from './routes/logs.js';

const app = new Hono();

app.use('*', cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const status = c.res.status;
  setImmediate(() => writeLog({
    timestamp: new Date().toISOString(),
    level: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
    type: 'http',
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status_code: status,
    duration_ms: Date.now() - start,
  }));
});

app.onError((err, c) => {
  setImmediate(() => writeLog({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    type: 'db',
    path: new URL(c.req.url).pathname,
    message: err instanceof Error ? err.message : String(err),
  }));
  return c.json({ error: 'Internal server error' }, 500);
});

app.route('/api/v1', settingsRoutes);
app.route('/api/v1', walletsRoutes);
app.route('/api/v1', holdingsRoutes);
app.route('/api/v1', transactionsRoutes);
app.route('/api/v1', snapshotsRoutes);
app.route('/api/v1', stakingRoutes);
app.route('/api/v1', groupsRoutes);
app.route('/api/v1', heliusRoutes);
app.route('/api/v1', bitvavoRoutes);
app.route('/api/v1', coingeckoRoutes);
app.route('/api/v1', logsRoutes);

const port = parseInt(process.env.SERVER_PORT ?? '3001');

await initDb();
console.log('Database schema ready.');

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
