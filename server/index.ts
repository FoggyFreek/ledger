import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDb } from './db.js';
import settingsRoutes from './routes/settings.js';
import walletsRoutes from './routes/wallets.js';
import holdingsRoutes from './routes/holdings.js';
import transactionsRoutes from './routes/transactions.js';
import snapshotsRoutes from './routes/snapshots.js';
import stakingRoutes from './routes/staking.js';
import groupsRoutes from './routes/groups.js';

const app = new Hono();

app.use('*', cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));

app.route('/api/v1', settingsRoutes);
app.route('/api/v1', walletsRoutes);
app.route('/api/v1', holdingsRoutes);
app.route('/api/v1', transactionsRoutes);
app.route('/api/v1', snapshotsRoutes);
app.route('/api/v1', stakingRoutes);
app.route('/api/v1', groupsRoutes);

const port = parseInt(process.env.SERVER_PORT ?? '3001');

await initDb();
console.log('Database schema ready.');

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
