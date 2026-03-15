import { describe, it, expect, afterEach } from 'vitest';
import app from '../../server/routes/settings.js';

afterEach(() => {
  delete process.env.HELIUS_API_KEY;
  delete process.env.COINGECKO_API_KEY;
  delete process.env.BITVAVO_KEY;
  delete process.env.BITVAVO_SECRET;
});

describe('GET /settings', () => {
  it('returns all false when no env vars are set', async () => {
    const res = await app.request('/settings');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ helius: false, coingecko: false, bitvavo: false });
  });

  it('returns helius: true when HELIUS_API_KEY is set', async () => {
    process.env.HELIUS_API_KEY = 'test-key';
    const res = await app.request('/settings');
    const json = await res.json();
    expect(json.helius).toBe(true);
    expect(json.coingecko).toBe(false);
    expect(json.bitvavo).toBe(false);
  });

  it('returns coingecko: true when COINGECKO_API_KEY is set', async () => {
    process.env.COINGECKO_API_KEY = 'cg-key';
    const res = await app.request('/settings');
    const json = await res.json();
    expect(json.coingecko).toBe(true);
    expect(json.helius).toBe(false);
  });

  it('returns bitvavo: true only when both BITVAVO_KEY and BITVAVO_SECRET are set', async () => {
    process.env.BITVAVO_KEY = 'bk';
    const res1 = await app.request('/settings');
    expect((await res1.json()).bitvavo).toBe(false);

    process.env.BITVAVO_SECRET = 'bs';
    const res2 = await app.request('/settings');
    expect((await res2.json()).bitvavo).toBe(true);
  });

  it('returns all true when all env vars are set', async () => {
    process.env.HELIUS_API_KEY = 'h';
    process.env.COINGECKO_API_KEY = 'c';
    process.env.BITVAVO_KEY = 'bk';
    process.env.BITVAVO_SECRET = 'bs';
    const res = await app.request('/settings');
    const json = await res.json();
    expect(json).toEqual({ helius: true, coingecko: true, bitvavo: true });
  });

  it('never exposes the actual key values', async () => {
    process.env.HELIUS_API_KEY = 'super-secret';
    const res = await app.request('/settings');
    const text = await res.text();
    expect(text).not.toContain('super-secret');
  });
});
