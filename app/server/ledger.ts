// Every step the system runs, kept as runs/ledger.jsonl in storage so the
// admin page can list all transactions after a restart. Also merges the
// saved demo:e2e runs (runs/*.json), so nothing that happened is missing.
import type { Step } from './flows.ts'
import { appendLine, storage } from './storage.ts'

const LEDGER = 'runs/ledger.jsonl'

export type LedgerEntry = Step & {
  /** Which flow the step belongs to. */
  flow: 'deposit' | 'payout' | 'transfer' | 'relay' | 'e2e'
  flowId: string
}

export function append(entry: LedgerEntry): Promise<void> {
  return appendLine(LEDGER, JSON.stringify(entry))
}

/** All entries, newest first; the saved e2e runs are included once each. */
export async function all(limit = 300): Promise<LedgerEntry[]> {
  const out: LedgerEntry[] = []
  for (const line of ((await storage.read(LEDGER)) ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as LedgerEntry)
    } catch {
      // a half-written line; skip it
    }
  }
  const seen = new Set(out.map((e) => e.tx ?? `${e.flowId}:${e.key}:${e.at}`))
  for (const name of await storage.list('runs/')) {
    if (!name.endsWith('.json') || name.endsWith('latest.json')) continue
    try {
      const run = JSON.parse((await storage.read(name)) ?? '{}') as { steps?: Step[] }
      for (const s of run.steps ?? []) {
        const id = s.tx ?? `${name}:${s.key}:${s.at}`
        if (seen.has(id)) continue
        seen.add(id)
        out.push({ ...s, flow: 'e2e', flowId: name.replace(/^runs\//, '').replace('.json', '') })
      }
    } catch {
      // not a run file
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
