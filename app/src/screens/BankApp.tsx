// The receiver's bank app (a fictional bank). A separate app from Boloka:
// its own name, palette, type, title and tab icon. Boloka withdrawals to the
// bank show as EFT credits once the pool has paid them out on testnet; the
// bank side itself is a stand-in (there is no real bank behind it).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { unitsToPula } from '../money.ts'
import * as store from '../store.ts'
import { readPool } from '../chain.ts'
import { fromHex } from '../proof.ts'
import { usePageMeta } from '../ui.tsx'

const NAVY = '#0B2545'
const NAVY_2 = '#13315C'
const GOLD = '#E0B44C'
const BG = '#EEF1F5'
const TEXT = '#14213D'
const SUB = '#64708A'
const LINE = '#DFE4EC'
const CREDIT = '#1B7F3B'
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** Balance before any Boloka withdrawals, in pula. */
const OPENING = 1284.6
const SEEN_KEY = 'ui.bankSeen' // per browser, not shared

type Txn = { id: string; title: string; detail: string; pula: number; date: string; credit: boolean }

/** Older activity, already counted in the opening balance. */
function history(): Txn[] {
  const day = (n: number, h: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(h, 12, 0, 0)
    return d.toISOString()
  }
  return [
    { id: 'h1', title: 'Choppies Supermarket', detail: 'Card purchase · Gaborone', pula: 412.3, date: day(2, 17), credit: false },
    { id: 'h2', title: 'BPC prepaid electricity', detail: 'Debit order', pula: 200, date: day(4, 9), credit: false },
    { id: 'h3', title: 'Airtime', detail: 'Mobile top-up', pula: 50, date: day(6, 13), credit: false },
    { id: 'h4', title: 'Cash withdrawal', detail: 'ATM · Molepolole', pula: 300, date: day(9, 11), credit: false },
  ]
}

/**
 * Boloka withdrawals to this account, as the bank sees them: only those the
 * pool has paid out (their nullifier is used on chain).
 */
async function credits(): Promise<Txn[]> {
  const mine = store.withdrawals().filter((w) => w.dest === 'bank')
  const { used } = await readPool(mine.map((w) => fromHex(w.nullifier)))
  return mine
    .filter((w) => used.has(w.nullifier))
    .map((w) => ({
      id: w.id,
      title: 'Boloka Dollar Savings',
      detail: `EFT credit · Ref ${w.reference}`,
      pula: unitsToPula(BigInt(w.amount)) - w.fee,
      date: w.date,
      credit: true,
    }))
}

const p2 = (n: number) =>
  `P ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const seenIds = () => new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
function markSeen(id: string) {
  const s = seenIds()
  s.add(id)
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

function Action({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <div style={{ width: 48, height: 48, borderRadius: 8, background: '#FFFFFF', border: `1px solid ${LINE}`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Glyph>{children}</Glyph>
      </div>
      <span style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

export default function BankApp() {
  usePageMeta('Kalahari Bank — Accounts', '/bank.svg')
  const [incoming, setIncoming] = useState<Txn[]>([])
  // Credits not seen before are marked NEW for this visit, and the balance
  // counts up to include them; no pop-up over the app itself.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [shown, setShown] = useState<number | null>(null)
  const [gain, setGain] = useState(0)
  const anim = useRef(0)

  // Boloka runs as a separate app; pick up its transfers as they land.
  const refresh = useCallback(() => {
    credits().then(setIncoming).catch(console.error)
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    const t = setInterval(refresh, 5000)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(t)
    }
  }, [refresh])

  const txns = [...incoming, ...history()].sort((a, b) => b.date.localeCompare(a.date))
  const balance = OPENING + incoming.reduce((n, t) => n + t.pula, 0)
  useEffect(() => {
    const seen = seenIds()
    const unseen = incoming.filter((t) => !seen.has(t.id))
    if (!unseen.length) return
    unseen.forEach((t) => markSeen(t.id))
    setFresh((f) => new Set([...f, ...unseen.map((t) => t.id)]))
    const added = unseen.reduce((n, t) => n + t.pula, 0)
    setGain(added)
    // Count the balance up from where it was to where it is now.
    const from = balance - added
    const t0 = performance.now()
    cancelAnimationFrame(anim.current)
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(k < 1 ? from + added * eased : null)
      if (k < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [incoming, balance])

  // The "+P …" chip shows for a few seconds after money comes in. Its own
  // effect, so the periodic re-read of transactions doesn't cancel it.
  useEffect(() => {
    if (!gain) return
    const hide = setTimeout(() => setGain(0), 6000)
    return () => clearTimeout(hide)
  }, [gain])

  const groups: [string, Txn[]][] = []
  for (const t of txns) {
    const label = dayLabel(t.date)
    const g = groups.find(([l]) => l === label)
    if (g) g[1].push(t)
    else groups.push([label, [t]])
  }

  const frame: CSSProperties = {
    width: 390,
    minHeight: 844,
    margin: '0 auto',
    background: BG,
    fontFamily: FONT,
    color: TEXT,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  }

  return (
    <div className="app-frame" style={frame}>
      {/* Header and account card on navy. */}
      <div style={{ background: NAVY, color: '#FFFFFF', padding: 'calc(18px + env(safe-area-inset-top)) 18px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/bank.svg" alt="" width={30} height={30} />
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>
              Kalahari <span style={{ color: GOLD }}>Bank</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, opacity: 0.9 }}>
            <Glyph>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </Glyph>
            <Glyph>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </Glyph>
          </div>
        </div>
        <div style={{ fontSize: 14, opacity: 0.8, marginTop: 18 }}>Dumela, Mom</div>

        <div style={{ marginTop: 14, background: NAVY_2, borderRadius: 10, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.85 }}>
            <span>Cheque account</span>
            <span style={{ color: GOLD, fontWeight: 700 }}>BWP</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 14 }}>Available balance</div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {p2(shown ?? balance)}
          </div>
          {gain > 0 && (
            <div style={{ display: 'inline-flex', marginTop: 6, fontSize: 13, fontWeight: 700, color: '#0B2545', background: '#9FE0B5', borderRadius: 999, padding: '3px 10px', animation: 'bank-chip-in 400ms ease-out' }}>
              +{p2(gain)} from Boloka Dollar Savings
            </div>
          )}
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Account •• 4821 · Gaborone Main</div>
        </div>
      </div>

      <div style={{ display: 'flex', padding: '18px 14px 6px', gap: 4 }}>
        <Action label="Pay">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </Action>
        <Action label="Transfer">
          <path d="M7 7h11l-3-3M17 17H6l3 3" />
        </Action>
        <Action label="Airtime">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" />
        </Action>
        <Action label="Cards">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </Action>
      </div>

      <div style={{ padding: '14px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Transactions</span>
        <span style={{ fontSize: 13, color: NAVY_2, fontWeight: 600 }}>Statements</span>
      </div>

      <div style={{ padding: '0 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(([label, list]) => (
          <div key={label}>
            <div style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, padding: '4px 4px 6px' }}>
              {label}
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 10, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
              {list.map((t, i) => {
                const isNew = t.credit && fresh.has(t.id)
                return (
                  <div
                    key={t.id}
                    id={`txn-${t.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '13px 14px',
                      borderTop: i ? `1px solid ${LINE}` : undefined,
                      background: isNew ? '#EAF6EE' : '#FFFFFF',
                      transition: 'background 600ms',
                      animation: isNew ? 'bank-row-in 500ms ease-out' : undefined,
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.credit ? '#E3F2E8' : '#EEF1F5', color: t.credit ? CREDIT : SUB, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <Glyph>{t.credit ? <path d="M12 5v14M5 12l7 7 7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}</Glyph>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {t.title}
                        {isNew && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#FFFFFF', background: CREDIT, borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>NEW</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: SUB, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.detail} · {new Date(t.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.credit ? CREDIT : TEXT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {t.credit ? '+' : '−'}
                      {p2(t.pula)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
