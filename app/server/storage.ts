// Where the server keeps its small state files: the shared records, the
// ledger, the yield state, job status. Local files in DATA_DIR (the app folder
// in dev; a persistent volume on Fly). Everything is small JSON/JSONL, so
// reads and writes move whole files.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DATA_DIR } from './paths.ts'

export interface Storage {
  read(name: string): Promise<string | null>
  write(name: string, text: string): Promise<void>
  /** Names under a folder-like prefix, e.g. 'runs/'. */
  list(prefix: string): Promise<string[]>
}

export const storage: Storage = {
  async read(name) {
    const f = join(DATA_DIR, name)
    return existsSync(f) ? readFileSync(f, 'utf8') : null
  },
  async write(name, text) {
    const f = join(DATA_DIR, name)
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, text)
  },
  async list(prefix) {
    const dir = join(DATA_DIR, prefix)
    return existsSync(dir) ? readdirSync(dir).map((f) => prefix + f) : []
  },
}

/** Appends a line to a JSONL file (read + write; the files are small). */
export async function appendLine(name: string, line: string) {
  const cur = (await storage.read(name)) ?? ''
  await storage.write(name, cur + line + '\n')
}
