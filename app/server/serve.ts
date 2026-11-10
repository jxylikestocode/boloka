// Production server: the built app (dist/) plus the API the apps need, on one
// port. `npm run build && npm start`. All apps share this one origin, so the
// root is the launcher, Boloka is at /home, MoneyGram at /moneygram, the
// bank at /bank. In the cloud, PORT and DATA_DIR come from the platform.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { DIST_DIR } from './paths.ts'
import { handle, recoverStaleJobs } from './routes.ts'
import { handleState } from './state.ts'

const PORT = Number(process.env.PORT ?? 8080)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

if (!existsSync(join(DIST_DIR, 'index.html'))) {
  console.error('dist/index.html is missing: run `npx vite build` first')
  process.exit(1)
}

await recoverStaleJobs()

createServer((req, res) => {
  void (async () => {
    if (await handleState(req, res)) return
    await handle(req, res, () => {
    // Static files, with the SPA's index.html for any app route.
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    let file = join(DIST_DIR, path)
    if (!file.startsWith(DIST_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(DIST_DIR, 'index.html')
    }
    const ext = extname(file)
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300')
    createReadStream(file).pipe(res)
    })
  })()
}).listen(PORT, () => console.log(`Boloka serving on :${PORT} (data in ${process.env.DATA_DIR ?? 'the app folder'})`))
