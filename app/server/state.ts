// State shared by Boloka, MoneyGram and the bank when they run on separate
// origins (separate browser storage): GET /api/state → {version, items};
// POST {key, value}. The deposit and withdrawal lists are merged by record
// id, never replaced: they hold the secrets that open the deposits. Used by
// the dev server (vite.config.ts) and the production server (serve.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dataPath } from './paths.ts'

type State = { version: number; items: Record<string, string> }
const LISTS = new Set(['savings.deposits', 'savings.withdrawals'])

function file() {
  return dataPath('.shared-state.json')
}

export function loadState(): State {
  if (!existsSync(file())) return { version: 0, items: {} }
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as State
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

/** Handles /api/state; returns false for any other URL. */
export function handleState(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url !== '/api/state') return false
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    res.end(JSON.stringify(loadState()))
    return true
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('{}')
    return true
  }
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    try {
      const { key, value } = JSON.parse(raw) as { key: string; value: string }
      if (typeof key !== 'string' || !/^(savings|demo)\./.test(key)) throw new Error('key')
      if (typeof value !== 'string') throw new Error('value')
      const s = loadState()
      s.items[key] = LISTS.has(key) ? mergeLists(s.items[key], value) : value
      s.version++
      writeFileSync(file(), JSON.stringify(s))
      res.end(JSON.stringify({ version: s.version }))
    } catch {
      res.statusCode = 400
      res.end('{}')
    }
  })
  return true
}
