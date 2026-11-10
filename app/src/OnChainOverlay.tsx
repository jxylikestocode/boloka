// A demo-only "under the hood" strip, deliberately styled like a developer
// console so it reads as separate from the app: it lists the real Stellar
// testnet transactions behind this user's transfers as they land, each
// linking to the chain explorer. Not part of the product UI, so the
// parents' screens themselves stay free of chain words.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import * as store from './store.ts'
import { keypair } from './chain.ts'
import { readProgress, type Progress } from './progress.ts'
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
const WIDTH = 372
const POS_KEY = 'ui.stripPos' // not a shared "demo." key: positions are per screen

type Pos = { x: number; y: number }

const clamp = (p: Pos): Pos => ({
  x: Math.max(0, Math.min(window.innerWidth - Math.min(WIDTH, window.innerWidth - 16), p.x)),
  y: Math.max(0, Math.min(window.innerHeight - 44, p.y)),
})

/** Beside the 390px phone frame on a wide screen; otherwise none (bottom of the screen). */
function defaultPos(): Pos | null {
  const wide = window.innerWidth >= 390 + 2 * (WIDTH + 24)
  return wide ? { x: window.innerWidth / 2 + 195 + 16, y: 16 } : null
}

/**
 * Drag anywhere by the handle (pointer events, so mouse and touch). Returns
 * the position (null = default bottom placement), the handle's props, and
 * whether the last pointer interaction was a drag rather than a tap.
 */
function useDraggable() {
  const [pos, setPos] = useState<Pos | null>(() => {
    try {
      const saved = localStorage.getItem(POS_KEY)
      return saved ? clamp(JSON.parse(saved) as Pos) : defaultPos()
    } catch {
      return defaultPos()
    }
  })
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const lastWasDrag = useRef(false)

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.closest('[data-strip]')?.getBoundingClientRect()
    if (!r) return
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }
    lastWasDrag.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const next = clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy })
    if (!d.moved) {
      const r = e.currentTarget.closest('[data-strip]')?.getBoundingClientRect()
      if (r && Math.hypot(next.x - r.left, next.y - r.top) < 4) return
      d.moved = true
    }
    setPos(next)
  }
  const onPointerUp = () => {
    if (drag.current?.moved) {
      lastWasDrag.current = true
      setPos((p) => {
        if (p) localStorage.setItem(POS_KEY, JSON.stringify(p))
        return p
      })
    }
    drag.current = null
  }
  return { pos, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }, lastWasDrag }
}

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

/** `facts` is an extra block shown at the top of the strip (Boloka's balance facts). */
/** Inside a frame on the homepage the strip is hidden: the page shows one strip for all three apps. */
const EMBEDDED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed')

/**
 * `facts` is an extra block shown at the top of the strip (Boloka's balance
 * facts). `inline` renders it as a normal block (the homepage, under the
 * three phones) instead of a draggable floating strip.
 */
export default function OnChainOverlay({ facts, inline = false }: { facts?: ReactNode; inline?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [progress, setProgress] = useState<Progress | null>(readProgress)
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const known = useRef<Set<string>>(new Set())
  const { pos, handle, lastWasDrag } = useDraggable()

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        // Found on the chain: deposits by this device's commitments, withdrawals by its account.
        const r = await fetch('/api/transactions/mine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: keypair().publicKey(), commitments: store.deposits().map((d) => d.commitment) }),
        })
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return
        const all = (await r.json()) as Entry[]
        // Withdrawals submitted from this device show up before the ledger has them.
        const local: Entry[] = store
          .withdrawals()
          .filter((w) => w.tx && !all.some((e) => e.tx === w.tx))
          .map((w) => ({ at: w.date, flowId: `local-${w.id}`, key: 'pool-withdraw', title: '', kind: 'real', tx: w.tx, usdc: Number(w.amount) / 1e7 }))
        const next = [...local, ...all].sort((a, b) => b.at.localeCompare(a.at))
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
    // A transfer or payout starting opens the strip so its steps are seen.
    let hadProgress = !!readProgress()
    const refreshProgress = () => {
      const p = readProgress()
      setProgress(p)
      if (p && !hadProgress) {
        setOpen(true)
        setHidden(false)
      }
      hadProgress = !!p
    }
    const onStorage = () => {
      refreshProgress()
      // A step just landed: its transaction is on the chain now.
      load()
    }
    window.addEventListener('storage', onStorage)
    const t2 = setInterval(refreshProgress, 2000)
    return () => {
      live = false
      clearInterval(t)
      clearInterval(t2)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  if (EMBEDDED || (!entries.length && !facts && !progress) || hidden) return null

  const place: CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }
  const base: CSSProperties = {
    ...(inline ? { position: 'relative', width: '100%' } : { position: 'fixed', ...place, zIndex: 60, width: `min(${WIDTH}px, calc(100% - 16px))` }),
    fontFamily: MONO,
    fontSize: 11,
    color: '#D7E6DD',
    background: 'rgba(12, 18, 16, 0.92)',
    border: '1px dashed rgba(120, 220, 170, 0.55)',
    borderRadius: 10,
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  }

  const grab: CSSProperties = { cursor: 'grab', touchAction: 'none', userSelect: 'none' }

  if (!open && !inline) {
    return (
      <button
        type="button"
        data-strip=""
        {...handle}
        onClick={() => !lastWasDrag.current && setOpen(true)}
        style={{ ...base, ...grab, width: 'auto', padding: '7px 12px', textAlign: 'left' }}
      >
        ⛓ demo · under the hood{entries.length ? ` · ${entries.length} on-chain transaction${entries.length === 1 ? '' : 's'}` : ''} · tap to see
      </button>
    )
  }

  return (
    <div data-strip="" style={{ ...base, padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div {...(inline ? {} : handle)} title={inline ? undefined : 'Drag to move'} style={{ ...(inline ? {} : grab), display: 'flex', alignItems: 'center', gap: 8, margin: '-10px -12px 0', padding: '10px 12px 4px' }}>
        <span style={{ fontWeight: 700, color: '#8EE0B4', letterSpacing: 0.4 }}>⛓ DEMO · UNDER THE HOOD</span>
        <span style={{ flex: 1, opacity: 0.7 }}>{inline ? 'not part of the apps · real Stellar testnet transactions behind the three phones' : 'not part of the app · drag me'}</span>
        {!inline && (
          <>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fold" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
              ▾
            </button>
            <button type="button" onClick={() => setHidden(true)} aria-label="Hide" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
              ✕
            </button>
          </>
        )}
      </div>
      {facts}
      {progress && (() => {
        const done = new Set(progress.steps.map((s) => s.key))
        const current = progress.flow.find((f) => !done.has(f.key))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 6, borderBottom: '1px dashed rgba(120, 220, 170, 0.35)' }}>
            <div style={{ fontWeight: 700, color: '#8EE0B4' }}>{current ? `right now · ${progress.title}` : progress.title.replace(' in progress', ' settled')}</div>
            {progress.flow.map((f) => {
              const s = progress.steps.find((x) => x.key === f.key)
              const now = f === current
              return (
                <div key={f.key} style={{ display: 'flex', gap: 8, opacity: s || now ? 1 : 0.5 }}>
                  <span style={{ width: 12, flex: 'none', color: s ? '#8EE0B4' : '#F0B96B', display: 'inline-flex', justifyContent: 'center' }}>
                    {s ? '✓' : now ? <span aria-label="in progress" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '2px solid #F0B96B', borderRightColor: 'transparent', animation: 'strip-spin 0.8s linear infinite' }} /> : '·'}
                  </span>
                  <span style={{ flex: 1 }}>{f.label}{now ? '…' : ''}{s?.kind === 'simulated' ? ' · simulated at this scale' : ''}</span>
                  {s?.tx && (
                    <a href={`${EXPLORER}/transactions/${s.tx}`} target="_blank" rel="noreferrer" style={{ color: '#8EE0B4', textDecoration: 'none', flex: 'none' }}>
                      {s.tx.slice(0, 6)}… ↗
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
      {entries.length > 0 && <div style={{ opacity: 0.75 }}>Real Stellar testnet transactions behind this screen:</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: inline ? 260 : 150, overflowY: 'auto' }}>
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
