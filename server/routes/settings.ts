import { Hono } from 'hono';

const app = new Hono();

// All API keys come from env vars. Return boolean flags — never the actual keys.
app.get('/settings', (c) => {
  return c.json({
    helius: !!process.env.HELIUS_API_KEY,
    coingecko: !!process.env.COINGECKO_API_KEY,
    bitvavo: !!(process.env.BITVAVO_KEY && process.env.BITVAVO_SECRET),
  });
});

export default app;
