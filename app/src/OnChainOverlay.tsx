// A demo-only "under the hood" strip, deliberately styled like a developer
// console so it reads as separate from the app: it lists the real Stellar
// testnet transactions behind this user's transfers as they land, each
// linking to the chain explorer. Not part of the product UI, so the
// parents' screens themselves stay free of chain words.
import { useEffect, useRef, useState } from 'react'
import * as store from './store.ts'
import { CHAIN_SCALE, PULA_PER_USD } from './money.ts'

import { EXPLORER } from './explorer.ts'

type Entry = {
  at: string
  /** On-chain amount in USDC (1/CHAIN_SCALE of the amount on screen). */
  usdc?: number
  flowId: string
  key: string
  title: string
  kind: 'real' | 'offchain' | 'read' | 'simulated'
  tx?: string
  data?: Record<string, unknown>
}

/** Short, plain names for the strip. */
const LABEL: Record<string, string> = {
  'sep24-deposit': 'anchor → USDC (SEP-24 deposit)',
  'pool-deposit': 'savings pool deposit',
  'blend-supply': 'Blend supply (yield)',
  'pool-withdraw': 'savings pool withdrawal',
  'blend-withdraw': 'Blend withdraw (yield)',
  'sep24-withdraw': 'USDC → anchor (SEP-24 withdrawal)',
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** The amount a step moved, from what the flow recorded. */
function usdcOf(e: Entry): number | undefined {
  const d = e.data ?? {}
  const v = d.received ?? d.usdc
  return v === undefined || v === null ? undefined : Number(v)
}

/** Steps whose amount is exactly the transfer, so "≈ P …" is meaningful. */
const TRANSFER_STEPS = new Set(['pool-deposit', 'pool-withdraw', 'blend-supply', 'blend-withdraw'])

/** "0.7356 USDC ≈ P 9,930": the on-chain amount and what it stands for on screen. */
function amountText(e: Entry, usdc: number | undefined) {
  if (usdc === undefined) return ''
  const text = `${usdc.toLocaleString('en-US', { maximumFractionDigits: 4 })} USDC`
  if (!TRANSFER_STEPS.has(e.key)) return text
  const pula = usdc * PULA_PER_USD * CHAIN_SCALE
  return `${text} ≈ P ${Math.round(pula).toLocaleString('en-US')}`
}

/**
 * Transactions belonging to this device's transfers: every flow that holds a
 * pool deposit for one of its commitments, or a pool withdrawal it made.
 */
function mine(all: Entry[]): Entry[] {
  const commitments = new Set(store.deposits().map((d) => d.commitment))
  const withdrawTxs = new Set(store.withdrawals().map((w) => w.tx).filter(Boolean))
  const flows = new Set(
    all
      .filter(
        (e) =>
          (e.key === 'pool-deposit' && commitments.has(String(e.data?.commitment ?? ''))) ||
          (e.key === 'pool-withdraw' && e.tx && withdrawTxs.has(e.tx)),
      )
      .map((e) => e.flowId),
  )
  return all.filter((e) => e.tx && flows.has(e.flowId)).sort((a, b) => b.at.localeCompare(a.at))
}

export default function OnChainOverlay() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const known = useRef<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await fetch('/api/transactions', { cache: 'no-store' })
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return
        const all = (await r.json()) as Entry[]
        // Withdrawals submitted from this device show up before the ledger has them.
        const local: Entry[] = store
          .withdrawals()
          .filter((w) => w.tx && !all.some((e) => e.tx === w.tx))
          .map((w) => ({ at: w.date, flowId: `local-${w.id}`, key: 'pool-withdraw', title: '', kind: 'real', tx: w.tx, usdc: Number(w.amount) / 1e7 }))
        const next = [...local, ...mine(all)].sort((a, b) => b.at.localeCompare(a.at))
        if (!live) return
        setEntries(next)
        // A new transaction opens the strip; the viewer can fold it again.
        const fresh = next.some((e) => e.tx && !known.current.has(e.tx))
        next.forEach((e) => e.tx && known.current.add(e.tx))
        if (fresh && known.current.size > 0) {
          setOpen(true)
          setHidden(false)
        }
      } catch {
        // dev server unreachable: nothing to show
      }
    }
    load()
    const t = setInterval(load, 4000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  if (!entries.length || hidden) return null

  const base = {
    position: 'fixed' as const,
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'calc(env(safe-area-inset-bottom) + 10px)',
    zIndex: 60,
    width: 'min(372px, calc(100% - 16px))',
    fontFamily: MONO,
    fontSize: 11,
    color: '#D7E6DD',
    background: 'rgba(12, 18, 16, 0.92)',
    border: '1px dashed rgba(120, 220, 170, 0.55)',
    borderRadius: 10,
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...base, width: 'auto', padding: '7px 12px', cursor: 'pointer', textAlign: 'left' }}>
        ⛓ demo · {entries.length} on-chain transaction{entries.length === 1 ? '' : 's'} · tap to see
      </button>
    )
  }

  return (
    <div style={{ ...base, padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#8EE0B4', letterSpacing: 0.4 }}>⛓ DEMO · UNDER THE HOOD</span>
        <span style={{ flex: 1, opacity: 0.7 }}>not part of the app</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fold" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ▾
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ✕
        </button>
      </div>
      <div style={{ opacity: 0.75 }}>Real Stellar testnet transactions behind this screen:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 168, overflowY: 'auto' }}>
        {entries.slice(0, 12).map((e) => (
          <a
            key={e.tx}
            href={`${EXPLORER}/transactions/${e.tx}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', gap: 8, alignItems: 'baseline', color: '#D7E6DD', textDecoration: 'none' }}
          >
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{LABEL[e.key] ?? e.key}</span>
              <span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>
                {amountText(e, e.usdc ?? usdcOf(e))}
                {(e.usdc ?? usdcOf(e)) !== undefined && ' · '}
                {new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </span>
            <span style={{ color: '#8EE0B4', flex: 'none' }}>{e.tx!.slice(0, 6)}…{e.tx!.slice(-4)} ↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}
