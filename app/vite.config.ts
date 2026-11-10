import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { readEnv } from './server/config.ts'

/**
 * The money flows (anchor deposit/withdrawal, pool, Blend mirror) and the
 * judges' run data, served by the dev server: see server/routes.ts.
 */
function flows(): Plugin {
  return {
    name: 'boloka-flows',
    apply: 'serve',
    // Loaded here, not at config time, so `vite build` never pulls in the
    // server (and its chain/anchor SDKs).
    async configureServer(server) {
      const { handle } = await import('./server/routes.ts')
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next)
      })
    },
  }
}

/** /api/state for the dev server (server/state.ts). */
function sharedState(): Plugin {
  return {
    name: 'shared-state',
    apply: 'serve',
    async configureServer(server) {
      const { handleState } = await import('./server/state.ts')
      server.middlewares.use((req, res, next) => {
        void handleState(req, res).then((done) => done || next())
      })
    },
  }
}

// VITE_APP (boloka | moneygram | bank) picks which app a server runs; each
// gets its own dependency cache so the three can run side by side.
const app = process.env.VITE_APP

// Single source of truth: with VITE_API_ORIGIN set (app/.env), the dev server
// serves only the UI and forwards every /api call to that server (the public
// deployment), so local shows exactly production's accounts, ledger and
// yield. Remove the line to run the backend locally.
const apiOrigin = process.env.VITE_API_ORIGIN ?? readEnv().VITE_API_ORIGIN

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: apiOrigin ? [react()] : [react(), flows(), sharedState()],
    cacheDir: app ? `node_modules/.vite-${app}` : undefined,
    // Synced on every change; never a reason to reload a page.
    server: {
      watch: { ignored: ['**/.shared-state.json', '**/.yield-state.json', '**/.accounts.json', '**/.runs/**'] },
      proxy: apiOrigin ? { '/api': { target: apiOrigin, changeOrigin: true } } : undefined,
    },
  }
})
