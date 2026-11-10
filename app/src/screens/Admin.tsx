// /admin: move pool funds to and from Blend, signed with Freighter by the
// pool's admin. Desktop layout in the style of docs/lender-portal.html.
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { i128, invokeAs, readPoolConfig, readPoolFunds, type Signer } from '../chain.ts'
import { POOL_ID } from '../config.ts'
import TransactionsCard from '../TransactionsCard.tsx'
import { connectFreighter } from '../freighter.ts'
import { BORDER, FONT, GREEN, INK, LINE, MUTED, PANEL, RED, TINT, disabledStyle, usePageMeta } from '../ui.tsx'

const UNITS = 10_000_000n
const EXPLORER = 'https://stellar.expert/explorer/testnet'

/** 1e-7 USDC units → "100.0001341". */
function usdc(units: bigint, decimals = 7) {
  const neg = units < 0n
  const u = neg ? -units : units
  const whole = (u / UNITS).toLocaleString('en-US')
  const frac = (u % UNITS).toString().padStart(7, '0').slice(0, decimals)
  return `${neg ? '−' : ''}${whole}${decimals ? '.' + frac : ''}`
}

/** "50.5" → 505000000n; null if not a positive amount with ≤ 7 decimals. */
function toUnits(text: string): bigint | null {
  const m = text.trim().replace(/,/g, '').match(/^(\d*)(?:\.(\d{0,7}))?$/)
  if (!m || (!m[1] && !m[2])) return null
  const units = BigInt(m[1] || '0') * UNITS + BigInt((m[2] ?? '').padEnd(7, '0') || '0')
  return units > 0n ? units : null
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

/** Turns contract and wallet failures into a sentence. */
function explain(e: unknown, maxBps: number): string {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('Error(Contract, #8)')) {
    return `That would lend more than the ${maxBps / 100}% cap allows.`
  }
  if (m.includes('Error(Contract, #9)')) return 'The pool does not hold that much idle USDC.'
  if (m.includes('Error(Contract, #6)')) return 'Enter an amount above zero.'
  if (m.includes('Error(Auth') || m.startsWith('NeedsSignatureFrom')) {
    return 'This wallet is not the pool admin.'
  }
  if (/declin|reject|denied|cancel/i.test(m)) return 'Cancelled in Freighter.'
  return m.length > 240 ? m.slice(0, 240) + '…' : m
}

const card: CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: 32,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

function Stat({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0', borderBottom: last ? undefined : `1px solid ${LINE}` }}>
      <span style={{ color: MUTED, fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 20 : 16, fontVariantNumeric: 'tabular-nums' }}>
        {value} <span style={{ color: MUTED, fontSize: 13, fontWeight: 500 }}>USDC</span>
      </span>
    </div>
  )
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'ok'; text: string; hash: string }
  | { kind: 'error'; text: string }

export default function Admin() {
  usePageMeta('Boloka Admin — Pool funds')
  const [config, setConfig] = useState<Awaited<ReturnType<typeof readPoolConfig>> | null>(null)
  const [funds, setFunds] = useState<Awaited<ReturnType<typeof readPoolFunds>> | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)
  const [loadError, setLoadError] = useState('')
  const [signer, setSigner] = useState<Signer | null>(null)
  const [connectError, setConnectError] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const refresh = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([readPoolConfig(), readPoolFunds()])
      setConfig(c)
      setFunds(f)
      setUpdated(new Date())
      setLoadError('')
    } catch (e) {
      console.error(e)
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Live view: interest accrues every ledger, so poll.
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10_000)
    return () => clearInterval(t)
  }, [refresh])

  async function connect() {
    setConnectError('')
    try {
      setSigner(await connectFreighter())
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e))
    }
  }

  const maxBps = config?.maxBps ?? 0
  const isAdmin = !!signer && !!config && signer.address === config.admin
  // Most that can be lent now without crossing the cap, and only from idle funds.
  const canLend = funds
    ? (() => {
        const room = (funds.total * BigInt(maxBps)) / 10_000n - funds.lent
        const m = room < funds.liquid ? room : funds.liquid
        return m > 0n ? m : 0n
      })()
    : 0n
  const units = toUnits(amount)
  const busy = status.kind === 'busy'
  // Lending the pool's own funds is off on testnet (see the note on the page).
  const lendable = false
  const ready = lendable && isAdmin && !busy && units !== null

  async function run(method: 'supply_to_blend' | 'withdraw_from_blend', value: bigint, verb: string) {
    if (!signer) return
    setStatus({ kind: 'busy', text: 'Approve in Freighter…' })
    try {
      const res = await invokeAs(
        { ...signer, sign: async (x) => { const s = await signer.sign(x); setStatus({ kind: 'busy', text: 'Submitting to testnet…' }); return s } },
        method,
        [i128(value)],
      )
      setStatus({ kind: 'ok', text: verb, hash: res.hash })
      setAmount('')
      await refresh()
    } catch (e) {
      console.error(e)
      setStatus({ kind: 'error', text: explain(e, maxBps) })
    }
  }

  const lentPct = funds && funds.total > 0n ? Number((funds.lent * 10_000n) / funds.total) / 100 : 0
  const capPct = maxBps / 100

  let walletLine: ReactNode
  if (!signer) {
    walletLine = (
      <button type="button" onClick={connect} style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 999, background: GREEN, color: '#FFFFFF', font: `600 14px ${FONT}`, cursor: 'pointer' }}>
        Connect Freighter
      </button>
    )
  } else {
    walletLine = (
      <div style={{ padding: '8px 12px', background: isAdmin ? TINT : '#FBE9E7', color: isAdmin ? GREEN : RED, borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
        {short(signer.address)} · {isAdmin ? 'admin' : 'not the admin'}
      </div>
    )
  }

  return (
    <div className="design" style={{ minHeight: '100vh', boxSizing: 'border-box', background: PANEL, display: 'flex', flexDirection: 'column', fontFamily: FONT, color: INK, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ height: 64, background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>B</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Boloka Admin</div>
          <div style={{ padding: '4px 10px', background: PANEL, borderRadius: 999, fontSize: 12, color: MUTED, fontWeight: 600 }}>Testnet</div>
        </div>
        {walletLine}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, padding: 40, maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box', alignItems: 'start' }}>
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Pool funds</h1>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              The pool contract holds the anchor's USDC (Circle's testnet USDC). Its lending
              on testnet is a mirror: the same amount of Blend's mock USDC supplied to Blend's
              testnet pool by the yield account, earning real interest. Amounts are on-chain
              (1/{(import.meta.env.VITE_CHAIN_SCALE as string) ?? '1000'} of the pula shown to parents).
            </div>
          </div>

          {loadError && <div style={{ fontSize: 14, color: RED }}>Could not read the pool: {loadError}</div>}

          <div style={{ border: `1.5px solid ${LINE}`, borderRadius: 14, padding: '4px 18px' }}>
            <Stat label="Held in the pool (Circle USDC)" value={funds ? usdc(funds.liquid) : '—'} />
            <Stat label="Mirrored in Blend (Blend mock USDC)" value={funds ? usdc(funds.lent) : '—'} />
            <Stat label="Total assets" value={funds ? usdc(funds.total) : '—'} strong last />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}>
              <span>Lent share <b style={{ color: INK }}>{lentPct.toFixed(2)}%</b></span>
              <span>Cap {capPct}%</span>
            </div>
            <div style={{ position: 'relative', height: 10, borderRadius: 999, background: PANEL }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(lentPct, 100)}%`, background: GREEN, borderRadius: 999 }} />
              <div title={`Cap ${capPct}%`} style={{ position: 'absolute', top: -4, bottom: -4, left: `${capPct}%`, width: 2, background: INK }} />
            </div>
          </div>

          <div style={{ fontSize: 13, color: MUTED }}>
            {updated ? `Updated ${updated.toLocaleTimeString('en-GB')} · refreshes every 10 s` : 'Loading…'}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Move funds</h1>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              Only the pool admin
              {config && (
                <> (<a href={`${EXPLORER}/account/${config.admin}`} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>{short(config.admin)}</a>)</>
              )}{' '}
              can move funds. Each move is signed in Freighter.
            </div>
            <div style={{ padding: '12px 14px', background: TINT, borderRadius: 12, fontSize: 13, lineHeight: 1.5, color: INK }}>
              Paused on testnet: the pool's Circle USDC can't be supplied to Blend's testnet pool,
              which only lists Blend's mock USDC. Every deposit and payout is mirrored into Blend
              automatically instead (see /how-it-works). With one USDC on mainnet these buttons move
              the pool's own funds.
            </div>
          </div>

          {!signer && (
            <div style={{ padding: '14px 16px', background: PANEL, borderRadius: 12, fontSize: 14, lineHeight: 1.5 }}>
              Connect Freighter with the admin account selected, on Testnet.
              {connectError && <div style={{ color: RED, fontWeight: 600, marginTop: 6 }}>{connectError}</div>}
            </div>
          )}
          {signer && !isAdmin && config && (
            <div style={{ padding: '14px 16px', background: '#FBE9E7', borderRadius: 12, fontSize: 14, color: RED, lineHeight: 1.5 }}>
              Freighter is using {short(signer.address)}. Switch to the admin account {short(config.admin)} and connect again.
              <div>
                <button type="button" onClick={connect} style={{ marginTop: 8, border: 'none', background: 'transparent', color: RED, font: `600 14px ${FONT}`, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Connect again
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="amount" style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>Amount (USDC)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                style={{ flex: 1, height: 52, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '0 16px', font: `600 18px ${FONT}`, color: INK, outline: 'none', minWidth: 0 }}
              />
              <button type="button" onClick={() => setAmount(usdc(canLend).replace(/,/g, ''))} style={{ height: 55, padding: '0 14px', border: `1.5px solid ${BORDER}`, borderRadius: 12, background: '#FFFFFF', font: `600 13px ${FONT}`, color: INK, cursor: 'pointer' }}>
                Max to lend
              </button>
            </div>
            <div style={{ fontSize: 13, color: MUTED }}>
              Can lend now: <b style={{ color: INK }}>{usdc(canLend)}</b> USDC (cap and idle funds)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              type="button"
              disabled={!ready}
              onClick={() => units && run('supply_to_blend', units, `Lent ${usdc(units)} USDC to Blend.`)}
              style={{ height: 52, border: 'none', borderRadius: 12, background: GREEN, color: '#FFFFFF', font: `600 15px ${FONT}`, cursor: 'pointer', ...(ready ? {} : disabledStyle) }}
            >
              Lend to Blend
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => units && run('withdraw_from_blend', units, `Recalled ${usdc(units)} USDC from Blend.`)}
              style={{ height: 52, border: `1.5px solid ${BORDER}`, borderRadius: 12, background: '#FFFFFF', color: INK, font: `600 15px ${FONT}`, cursor: 'pointer', ...(ready ? {} : disabledStyle) }}
            >
              Recall from Blend
            </button>
          </div>
          <button
            type="button"
            disabled={!lendable || !isAdmin || busy || !funds || funds.lent <= 0n}
            // Blend withdraws the whole position when asked for more than it holds.
            onClick={() => funds && run('withdraw_from_blend', funds.lent * 2n + UNITS, 'Recalled everything from Blend.')}
            style={{ height: 40, border: 'none', background: 'transparent', color: MUTED, font: `600 14px ${FONT}`, cursor: 'pointer', ...(lendable && isAdmin && !busy && funds && funds.lent > 0n ? {} : disabledStyle) }}
          >
            Recall everything
          </button>

          {status.kind !== 'idle' && (
            <div
              role="status"
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                background: status.kind === 'error' ? '#FBE9E7' : status.kind === 'ok' ? TINT : PANEL,
                color: status.kind === 'error' ? RED : status.kind === 'ok' ? GREEN : INK,
                fontWeight: 600,
              }}
            >
              {status.text}
              {status.kind === 'ok' && (
                <>
                  {' '}
                  <a href={`${EXPLORER}/tx/${status.hash}`} target="_blank" rel="noreferrer" style={{ color: GREEN }}>
                    View transaction
                  </a>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 'auto', padding: '14px 16px', background: PANEL, borderRadius: 12, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            Pool <a href={`${EXPLORER}/contract/${POOL_ID}`} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>{short(POOL_ID)}</a>
            {config && (
              <>
                {' '}· lends to Blend pool{' '}
                <a href={`${EXPLORER}/contract/${config.blendPool}`} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>{short(config.blendPool)}</a>
              </>
            )}
          </div>
        </div>
        <TransactionsCard poolId={POOL_ID} style={{ gridColumn: '1 / -1' }} />
      </div>
    </div>
  )
}
