// This device's pool transactions, found on the chain itself through Horizon:
// pool `deposit` calls whose commitment is one of the device's, and pool
// `withdraw` calls signed by the device's account. Nothing here depends on
// what the server happened to record, so the list matches the app's history
// even for transfers made before the ledger existed or from another device.
import { scValToNative, xdr } from '@stellar/stellar-sdk'
import type { Step } from './flows.ts'
import * as ledger from './ledger.ts'
import type { LedgerEntry } from './ledger.ts'

const HORIZON = 'https://horizon-testnet.stellar.org'

type Op = {
  type: string
  function?: string
  transaction_hash: string
  created_at: string
  parameters?: { type: string; value: string }[]
}

type Call = { tx: string; at: string; fn: string; args: unknown[] }

const cache = new Map<string, { at: number; calls: Call[] }>()

/** Contract calls made from `account`, newest first (two Horizon pages). */
async function calls(account: string, contract: string): Promise<Call[]> {
  const hit = cache.get(account)
  if (hit && Date.now() - hit.at < 15_000) return hit.calls
  const out: Call[] = []
  let url = `${HORIZON}/accounts/${account}/operations?limit=200&order=desc`
  for (let page = 0; page < 2 && url; page++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) break
    const body = (await r.json()) as { _embedded: { records: Op[] }; _links?: { next?: { href: string } } }
    for (const op of body._embedded.records) {
      if (op.type !== 'invoke_host_function' || !op.parameters?.length) continue
      try {
        const vals = op.parameters.map((p) => scValToNative(xdr.ScVal.fromXDR(p.value, 'base64')) as unknown)
        if (vals[0] !== contract || typeof vals[1] !== 'string') continue
        out.push({ tx: op.transaction_hash, at: op.created_at, fn: vals[1], args: vals.slice(2) })
      } catch {
        // not a call we can read
      }
    }
    url = body._embedded.records.length === 200 ? (body._links?.next?.href ?? '') : ''
  }
  cache.set(account, { at: Date.now(), calls: out })
  return out
}

const hex = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString('hex') : '')
const usdc = (n: unknown) => Number(n) / 1e7

/**
 * Steps for this device: its deposits (by commitment, from the sender
 * account) and its withdrawals (signed by `account`). A transaction the
 * ledger knows brings its whole flow (anchor and Blend legs) along.
 */
export async function forDevice(
  poolId: string,
  sender: string,
  account: string,
  commitments: Set<string>,
): Promise<LedgerEntry[]> {
  const [fromSender, fromDevice] = await Promise.all([
    calls(sender, poolId).catch(() => [] as Call[]),
    calls(account, poolId).catch(() => [] as Call[]),
  ])
  const found: { call: Call; key: 'pool-deposit' | 'pool-withdraw'; amount: unknown }[] = []
  for (const c of fromSender) {
    // deposit(from, commitment, amount)
    if (c.fn === 'deposit' && commitments.has(hex(c.args[1]))) found.push({ call: c, key: 'pool-deposit', amount: c.args[2] })
  }
  for (const c of fromDevice) {
    // withdraw(nullifier, leaf, path, index, to, amount)
    if (c.fn === 'withdraw') found.push({ call: c, key: 'pool-withdraw', amount: c.args[5] })
  }

  const all = await ledger.all(2000)
  const byTx = new Map(all.filter((e) => e.tx).map((e) => [e.tx!, e]))
  const out = new Map<string, LedgerEntry>()
  for (const f of found) {
    const known = byTx.get(f.call.tx)
    if (known) {
      for (const e of all) if (e.flowId === known.flowId && e.tx) out.set(e.tx, e)
    } else {
      const step: Step = {
        key: f.key,
        title: f.key === 'pool-deposit' ? 'Pool deposit for the parents (commitment only)' : 'Pool withdraw to the payout account',
        kind: 'real',
        tx: f.call.tx,
        data: { usdc: usdc(f.amount) },
        at: f.call.at,
      }
      out.set(f.call.tx, { ...step, flow: f.key === 'pool-deposit' ? 'deposit' : 'payout', flowId: `chain-${f.call.tx.slice(0, 8)}` })
    }
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at))
}
