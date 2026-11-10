// Where the server keeps its small state files: the shared records, the
// ledger, the yield state, job status. Two backends behind one interface:
//   - local files in DATA_DIR (dev server, scripts, Fly/Docker with a volume)
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (serverless: no disk)
// Everything is small JSON/JSONL, so reads and writes move whole files.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DATA_DIR } from './paths.ts'

export interface Storage {
  read(name: string): Promise<string | null>
  write(name: string, text: string): Promise<void>
  /** Names under a folder-like prefix, e.g. 'runs/'. */
  list(prefix: string): Promise<string[]>
}

const local: Storage = {
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

/** Vercel Blob, private, overwritable, read fresh (no CDN cache). */
function blob(): Storage {
  type Mod = typeof import('@vercel/blob')
  const mod = import('@vercel/blob') as Promise<Mod>
  return {
    async read(name) {
      const { get, BlobNotFoundError } = await mod
      try {
        const r = await get(name, { access: 'private', useCache: false })
        if (!r) return null
        return await new Response(r.stream).text()
      } catch (e) {
        if (e instanceof BlobNotFoundError) return null
        throw e
      }
    },
    async write(name, text) {
      const { put } = await mod
      await put(name, text, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' })
    },
    async list(prefix) {
      const { list } = await mod
      const out: string[] = []
      let cursor: string | undefined
      do {
        const page = await list({ prefix, cursor, limit: 1000 })
        out.push(...page.blobs.map((b) => b.pathname))
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return out
    },
  }
}

export const storage: Storage = process.env.BLOB_READ_WRITE_TOKEN ? blob() : local

/** Appends a line to a JSONL file (read + write; the files are small). */
export async function appendLine(name: string, line: string) {
  const cur = (await storage.read(name)) ?? ''
  await storage.write(name, cur + line + '\n')
}
