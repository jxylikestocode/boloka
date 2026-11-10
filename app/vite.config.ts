import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handle } from './server/routes.ts'

/**
 * The money flows (anchor deposit/withdrawal, pool, Blend mirror) and the
 * judges' run data, served by the dev server: see server/routes.ts.
 */
function flows(): Plugin {
  return {
    name: 'boloka-flows',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next)
      })
    },
  }
}

/**
 * State shared by Boloka, MoneyGram and the bank, which run on separate ports
 * (separate storage): GET /api/state → {version, items}; POST {key, value}.
 * Kept in .shared-state.json (gitignored) so all three servers share it. It
 * holds this browser data's deposit secrets and testnet keys, so it stays on
 * this machine; the deposit and withdrawal lists are merged, never replaced.
 */
const STATE_FILE = new URL('./.shared-state.json', import.meta.url)
type State = { version: number; items: Record<string, string> }
const LISTS = new Set(['savings.deposits', 'savings.withdrawals'])

function loadState(): State {
  if (!existsSync(STATE_FILE)) return { version: 0, items: {} }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State
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

function sharedState(): Plugin {
  return {
    name: 'shared-state',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') return res.end(JSON.stringify(loadState()))
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('{}')
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
            writeFileSync(STATE_FILE, JSON.stringify(s))
            res.end(JSON.stringify({ version: s.version }))
          } catch {
            res.statusCode = 400
            res.end('{}')
          }
        })
      })
    },
  }
}

// VITE_APP (boloka | moneygram | bank) picks which app a server runs; each
// gets its own dependency cache so the three can run side by side.
const app = process.env.VITE_APP

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), flows(), sharedState()],
    cacheDir: app ? `node_modules/.vite-${app}` : undefined,
    // Synced on every change; never a reason to reload a page.
    server: { watch: { ignored: ['**/.shared-state.json', '**/.yield-state.json', '**/.accounts.json', '**/.runs/**'] } },
  }
})
