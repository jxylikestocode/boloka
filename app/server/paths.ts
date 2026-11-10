// Where the server keeps its state files. Locally that's the app folder;
// in the cloud DATA_DIR points at a persistent volume, so role accounts,
// shared records and the ledger survive restarts and redeploys.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
export const DATA_DIR = process.env.DATA_DIR ?? APP_DIR

export function dataPath(name: string): string {
  mkdirSync(DATA_DIR, { recursive: true })
  return join(DATA_DIR, name)
}

/** The built app (vite build) served by server/serve.ts. */
export const DIST_DIR = join(APP_DIR, 'dist')
