import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Demo state shared by every screen, tab, home-screen app and device:
 * GET /api/state → {version, items}; POST /api/state {key, value|null}.
 * Kept in a file so both dev servers (localhost and Tailscale) share it.
 * This only syncs the demo's saved screens; there is still no money backend.
 */
const STATE_FILE = new URL('./.demo-state.json', import.meta.url)
type State = { version: number; items: Record<string, string> }

function load(): State {
  if (!existsSync(STATE_FILE)) return { version: 0, items: {} }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State
  } catch {
    return { version: 0, items: {} }
  }
}

function demoState(): Plugin {
  return {
    name: 'demo-state',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') return res.end(JSON.stringify(load()))
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('{}')
        }
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          try {
            const { key, value } = JSON.parse(raw) as { key: string; value: string | null }
            if (typeof key !== 'string' || !/^(savings|demo)\./.test(key)) throw new Error('key')
            const s = load()
            if (value === null) delete s.items[key]
            else s.items[key] = String(value)
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

// Demo build: no network backend. Runs on 5174 so its saved state never
// mixes with the real app on 5173.
// VITE_APP (boloka | moneygram | bank) picks which app a server runs; each
// gets its own dependency cache so the three servers can run side by side.
const app = process.env.VITE_APP
export default defineConfig({
  plugins: [react(), demoState()],
  server: { port: 5174, watch: { ignored: ['**/.demo-state.json'] } },
  cacheDir: app ? `node_modules/.vite-${app}` : undefined,
})
