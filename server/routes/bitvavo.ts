import { Hono } from 'hono'
import type { Context } from 'hono'
import { createHmac } from 'crypto'
import { writeLog } from '../lib/logger.js'

const BITVAVO_KEY = process.env.BITVAVO_KEY
const BITVAVO_SECRET = process.env.BITVAVO_SECRET
const BITVAVO_BASE_URL = 'https://api.bitvavo.com'
const BITVAVO_TIMEOUT = 10_000

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) query.append(key, value)
  }

  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

async function bitvavoRequest(method: HttpMethod, path: string, body?: unknown) {
  if (!BITVAVO_KEY || !BITVAVO_SECRET) {
    throw new Error('Bitvavo credentials are not configured')
  }

  const timestamp = Date.now().toString()
  const payload = body ? JSON.stringify(body) : ''
  const message = timestamp + method + path + payload

  const signature = createHmac('sha256', BITVAVO_SECRET).update(message).digest('hex')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BITVAVO_TIMEOUT)

  const start = Date.now()
  try {
    const response = await fetch(`${BITVAVO_BASE_URL}${path}`, {
      method,
      headers: {
        'Bitvavo-Access-Key': BITVAVO_KEY,
        'Bitvavo-Access-Signature': signature,
        'Bitvavo-Access-Timestamp': timestamp,
        'Content-Type': 'application/json'
      },
      body: method !== 'GET' ? payload : undefined,
      signal: controller.signal
    })

    setImmediate(() => writeLog({
      timestamp: new Date().toISOString(),
      level: response.ok ? 'INFO' : response.status >= 500 ? 'ERROR' : 'WARN',
      type: 'external',
      target: 'bitvavo',
      method,
      path,
      status_code: response.status,
      duration_ms: Date.now() - start,
    }))

    if (!response.ok) {
      const text = await response.text()
      throw Object.assign(new Error(`Bitvavo API error: ${text}`), { status: response.status })
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function handleRequest(c: Context, path: string) {
  try {
    const data = await bitvavoRequest('GET', path)
    return c.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = (err as { status?: number }).status ?? 500
    setImmediate(() => writeLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'db',
      path,
      message,
    }))
    return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 500)
  }
}

const app = new Hono()

app.get('/bitvavo/status', (c) => {
  return c.json({ configured: !!(BITVAVO_KEY && BITVAVO_SECRET) })
})

app.get('/bitvavo/balance', (c) => handleRequest(c, '/v2/balance'))

app.get('/bitvavo/account/history', (c) => {
  const query = buildQuery({
    fromDate: c.req.query('fromDate'),
    toDate: c.req.query('toDate'),
    page: c.req.query('page'),
    maxItems: c.req.query('maxItems'),
    type: c.req.query('type')
  })
  return handleRequest(c, `/v2/account/history${query}`)
})

export default app
