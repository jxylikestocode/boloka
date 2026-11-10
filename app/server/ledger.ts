// Every step the system runs, kept in app/.runs/ledger.jsonl (gitignored) so
// the admin page can list all transactions after a restart. Also merges the
// saved demo:e2e runs, so nothing that happened on testnet is missing.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import type { Step } from './flows.ts'

const DIR = new URL('../.runs/', import.meta.url)
const FILE = new URL('../.runs/ledger.jsonl', import.meta.url)

export type LedgerEntry = Step & {
  /** Which flow the step belongs to. */
  flow: 'deposit' | 'payout' | 'e2e'
  flowId: string
}

export function append(entry: LedgerEntry) {
  mkdirSync(DIR, { recursive: true })
  appendFileSync(FILE, JSON.stringify(entry) + '\n')
}

/** All entries, newest first; the saved e2e runs are included once each. */
export function all(limit = 300): LedgerEntry[] {
  const out: LedgerEntry[] = []
  if (existsSync(FILE)) {
    for (const line of readFileSync(FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as LedgerEntry)
      } catch {
        // a half-written line; skip it
      }
    }
  }
  const seen = new Set(out.map((e) => e.tx ?? `${e.flowId}:${e.key}:${e.at}`))
  if (existsSync(DIR)) {
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith('.json') || f === 'latest.json') continue
      try {
        const run = JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as { steps: Step[] }
        for (const s of run.steps) {
          const id = s.tx ?? `${f}:${s.key}:${s.at}`
          if (seen.has(id)) continue
          seen.add(id)
          out.push({ ...s, flow: 'e2e', flowId: f.replace('.json', '') })
        }
      } catch {
        // not a run file
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
