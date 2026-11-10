// Every transaction the system has made, newest first, each linked to the
// chain explorer. Used on /admin. Reads the dev server's ledger; on a static
// deploy it falls back to the shipped demo:e2e run.
import { useEffect, useState, type CSSProperties } from 'react'
import { GREEN, INK, LINE, MUTED, PANEL, RED, TINT } from './ui.tsx'

const EXPLORER = 'https://stellar.expert/explorer/testnet'

type Entry = {
  at: string
  flow?: 'deposit' | 'payout' | 'e2e'
  key: string
  title: string
  kind: 'real' | 'offchain' | 'read' | 'simulated'
  tx?: string
  note?: string
  data?: Record<string, unknown>
}

const FLOW: Record<NonNullable<Entry['flow']>, string> = { deposit: 'Money in', payout: 'Payout', e2e: 'Rehearsal run' }
const KIND: Record<Entry['kind'], { label: string; fg: string; bg: string }> = {
  real: { label: 'on chain', fg: GREEN, bg: TINT },
  offchain: { label: 'off-chain', fg: '#1F4E8C', bg: '#E5EEFA' },
  read: { label: 'read-only', fg: '#1F4E8C', bg: '#E5EEFA' },
  simulated: { label: 'simulated', fg: RED, bg: '#FBE9E7' },
}

/** The amount a step moved, if it recorded one. */
function amount(e: Entry): string {
  const d = e.data ?? {}
  const v = d.received ?? d.usdc ?? d.valueUsdc
  return v === undefined || v === null ? '' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 7 })} USDC`
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

const th: CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: MUTED, padding: '8px 10px', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap' }
const td: CSSProperties = { fontSize: 13, padding: '10px 10px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' }

export default function TransactionsCard({ poolId, style }: { poolId: string; style?: CSSProperties }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        // A server without the API answers with the app's HTML page, not JSON.
        const r = await fetch('/api/transactions', { cache: 'no-store' })
        if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
          if (live) setEntries((await r.json()) as Entry[])
          return
        }
        // Static hosting: the shipped rehearsal run.
        const f = await fetch('/runs/latest.json')
        if (!f.ok) throw new Error(`${f.status}`)
        const run = (await f.json()) as { steps: Entry[] }
        if (live) setEntries([...run.steps].reverse().map((s) => ({ ...s, flow: 'e2e' })))
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    const t = setInterval(load, 10_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  const onChain = entries?.filter((e) => e.tx).length ?? 0

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Transactions</h2>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
            Every step the system has run, newest first: anchor deposits and withdrawals, pool deposits and
            payouts, and the Blend mirror. {onChain} on-chain transactions.
          </div>
        </div>
        <a href={`${EXPLORER}/contract/${poolId}`} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
          Pool contract on stellar.expert ↗
        </a>
      </div>

      {error && <div style={{ color: RED, fontSize: 13 }}>Could not load transactions: {error}</div>}
      {entries && entries.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Nothing yet.</div>}
      {entries && entries.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', color: INK }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Flow</th>
                <th style={th}>Step</th>
                <th style={th}>Amount</th>
                <th style={th}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.tx ?? e.key}-${e.at}-${i}`} style={{ background: i % 2 ? PANEL : '#FFFFFF' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{when(e.at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.flow ? FLOW[e.flow] : ''}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{e.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: KIND[e.kind].fg, background: KIND[e.kind].bg, borderRadius: 999, padding: '2px 8px' }}>{KIND[e.kind].label}</span>
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amount(e)}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                    {e.tx ? (
                      <a href={`${EXPLORER}/tx/${e.tx}`} target="_blank" rel="noreferrer" title={e.tx} style={{ color: GREEN, textDecoration: 'none' }}>
                        {e.tx.slice(0, 8)}…{e.tx.slice(-8)} ↗
                      </a>
                    ) : (
                      <span style={{ color: MUTED }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
