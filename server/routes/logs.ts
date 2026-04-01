import { Hono } from 'hono';
import { getRecentLogs, clearLogs } from '../lib/logger.js';

const app = new Hono();

app.get('/logs', (c) => c.json(getRecentLogs()));
app.delete('/logs', (c) => { clearLogs(); return c.json({ ok: true }); });

export default app;
