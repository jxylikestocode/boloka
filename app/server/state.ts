// State shared by Boloka, MoneyGram and the bank when they run on separate
// origins (separate browser storage): GET /api/state → {version, items};
// POST {key, value}. The deposit and withdrawal lists are merged by record
// id, never replaced: they hold the secrets that open the deposits. Used by
// the dev server and the production server.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readEnv } from './config.ts'
import { storage } from './storage.ts'

type State = { version: number; items: Record<string, string> }
const LISTS = new Set(['savings.deposits', 'savings.withdrawals'])
const FILE = 'shared-state.json'

export async function loadState(): Promise<State> {
  try {
    const raw = await storage.read(FILE)
    return raw ? (JSON.parse(raw) as State) : { version: 0, items: {} }
  } catch {
    return { version: 0, items: {} }
  }
}

function mergeLists(a: string | undefined, b: string): string {
  const out = new Map<string, unknown>()
  for (const raw of [a ?? '[]', b]) {
    for (const r of JSON.parse(raw) as { id: string }[]) {
      if (r && typeof r.id === 'string') out.set(r.id, { ...(out.get(r.id) as object | undefined), ...r })
    }
  }
  return JSON.stringify([...out.values()])
}

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => resolve(raw))
  })

/** Handles /api/state; resolves false for any other URL. */
export async function handleState(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if ((req.url ?? '').split('?')[0] !== '/api/state') return false
  // On by VITE_SHARED_STATE=true in app/.env (local dev) or SHARED_STATE=true in the cloud.
  if (process.env.SHARED_STATE !== 'true' && readEnv().VITE_SHARED_STATE !== 'true') {
    res.statusCode = 404
    res.end('{"error":"shared state is off: each browser is its own account"}')
    return true
  }
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    res.end(JSON.stringify(await loadState()))
    return true
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('{}')
    return true
  }
  try {
    const { key, value } = JSON.parse(await body(req)) as { key: string; value: string }
    if (typeof key !== 'string' || !/^(savings|demo)\./.test(key)) throw new Error('key')
    if (typeof value !== 'string') throw new Error('value')
    const s = await loadState()
    s.items[key] = LISTS.has(key) ? mergeLists(s.items[key], value) : value
    s.version++
    await storage.write(FILE, JSON.stringify(s))
    res.end(JSON.stringify({ version: s.version }))
  } catch {
    res.statusCode = 400
    res.end('{}')
  }
  return true
}
