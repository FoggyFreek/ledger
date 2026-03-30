import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/colony-season', async (c) => {
  const rows = await sql`SELECT data, fetched_at FROM colony_season_cache WHERE id = 'current'`;
  if (rows.length === 0) return c.json(null);
  return c.json({ ...rows[0].data, fetchedAt: Number(rows[0].fetched_at) });
});

app.put('/colony-season', async (c) => {
  const body = await c.req.json();
  const { fetchedAt, ...data } = body;
  await sql`
    INSERT INTO colony_season_cache (id, data, fetched_at)
    VALUES ('current', ${sql.json(data)}, ${fetchedAt})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
  `;
  return c.json({ ok: true });
});

app.delete('/colony-season', async (c) => {
  await sql`DELETE FROM colony_season_cache WHERE id = 'current'`;
  return c.json({ ok: true });
});

export default app;
