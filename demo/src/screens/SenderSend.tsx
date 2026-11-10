// Mock MoneyGram send screen: the sender's side of a transfer into Boloka.
// A separate app, so it deliberately shares nothing visual with Boloka: its
// own palette, font, shapes, title and tab icon. Copy, rates and the
// over-the-limit rule follow docs/moneygram-send-1000.html / -10000.html.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ANCHOR_DOMAIN, discover, registerDeposit, sendCustomer, signIn } from '../anchor.ts'
import { senderKeypair, setupAccount } from '../chain.ts'
import { depositForReceiver } from '../deposit.ts'
import { HIDDEN_COST, ORANGE_LIMIT, PULA_PER_USD, TRANSFER_CAP } from '../money.ts'
import { usePageMeta } from '../ui.tsx'
import { EXPLORER } from '../explorer.ts'

const RECEIVER = 'Mma Kgosi'
const BOLOKA_RATE = 9.93
const ORANGE_RATE = 9.87
const CASH_RATE = 9.51
/**
 * Dollars deposited per CAD sent. 9.93 / 13.5 ≈ 0.7356, so the receiver's
 * balance (dollars × 13.5) shows exactly CAD × 9.93 pula. The quoted 0.715
 * would show only ≈ 9.65 pula per CAD.
 */
const USD_PER_CAD = BOLOKA_RATE / PULA_PER_USD
/** The per-transfer cap on remittances into Orange Money (Remitly's cap), in pula. */
const PER_TRANSFER_LIMIT = TRANSFER_CAP
/** The test anchor takes at most 10 USDC per deposit (its /sep24/info). */
const ANCHOR_CAP = 10

/** Where the anchor leg of a transfer has got to. */
type AnchorProgress = {
  amount: string
  status: string
  url?: string
  stellarTx?: string
}

const ANCHOR_STATUS: Record<string, string> = {
  connecting: 'Connecting to the anchor (account setup, SEP-10 sign-in)…',
  kyc: 'Sharing your verified details with the anchor (SEP-12)…',
  registering: 'Registering the deposit with the anchor (SEP-6)…',
  registered: 'Deposit registered with the anchor (SEP-6)',
  incomplete: 'Fill in the form in the anchor window',
  pending_user_transfer_start: 'Anchor is waiting for the payment',
  pending_anchor: 'Anchor is processing the deposit',
  pending_stellar: 'Anchor is paying out on Stellar',
  pending_trust: 'Waiting for the trustline',
  completed: 'Anchor deposit completed on Stellar',
}

type Method = 'boloka' | 'orange' | 'cash'
const NAMES: Record<Method, string> = {
  boloka: 'Boloka',
  orange: 'Orange Money',
  cash: 'Cash pickup',
}

// MoneyGram's look: red on white and grey, square-ish corners, Helvetica/Arial.
const MG_RED = '#DA291C'
const MG_RED_DARK = '#B21F14'
const MG_TINT = '#FDECEA'
const TEXT = '#1F1F1F'
const SUBTLE = '#6E6E6E'
const RULE = '#E3E3E3'
const PAGE = '#F2F2F2'
const MG_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'

const rate = (r: number) => r.toFixed(4)
const money = (n: number, decimals: number) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
const parseCad = (text: string) => Number(text.replace(/,/g, '')) || 0

const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: SUBTLE,
  padding: '18px 16px 8px',
}
const section: CSSProperties = {
  background: '#FFFFFF',
  borderTop: `1px solid ${RULE}`,
  borderBottom: `1px solid ${RULE}`,
}

function Header() {
  return (
    <div style={{ background: MG_RED, color: '#FFFFFF', boxSizing: 'content-box', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top) 16px 0', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/moneygram.svg" alt="" width={26} height={26} style={{ background: '#FFFFFF', borderRadius: '50%' }} />
        <span style={{ fontSize: 20, fontWeight: 700, fontStyle: 'italic', letterSpacing: -0.3 }}>MoneyGram</span>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, opacity: 0.85, textAlign: 'right', lineHeight: 1.2 }}>demo screen<br />not affiliated</span>
        <span style={{ fontSize: 12, fontWeight: 700, border: '1.5px solid rgba(255,255,255,0.7)', borderRadius: 3, padding: '3px 6px', letterSpacing: 0.5 }}>
          CA · EN
        </span>
      </span>
    </div>
  )
}

/** Amount ✓ — Delivery (current) — Payment — Review. */
function Steps() {
  const steps = ['Amount', 'Delivery', 'Payment', 'Review']
  return (
    <div style={{ display: 'flex', background: '#FFFFFF', borderBottom: `1px solid ${RULE}`, padding: '12px 16px', gap: 6 }}>
      {steps.map((label, i) => {
        const done = i === 0
        const current = i === 1
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 4, borderRadius: 2, background: done || current ? MG_RED : RULE }} />
            <span style={{ fontSize: 11, fontWeight: current ? 700 : 500, color: current ? TEXT : SUBTLE }}>
              {done ? '✓ ' : ''}
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A receive-method row: icon, details, and a radio on the right. */
function MethodRow(props: {
  selected: boolean
  disabled: boolean
  onSelect: () => void
  icon: ReactNode
  name: string
  rateValue: number
  note?: ReactNode
  last?: boolean
}) {
  const { selected, disabled } = props
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px 14px 12px',
        borderLeft: `4px solid ${selected ? MG_RED : 'transparent'}`,
        borderBottom: props.last ? undefined : `1px solid ${RULE}`,
        background: selected ? MG_TINT : '#FFFFFF',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {props.icon}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: disabled ? SUBTLE : TEXT }}>{props.name}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: disabled ? SUBTLE : TEXT, whiteSpace: 'nowrap' }}>
            {rate(props.rateValue)}
            <span style={{ fontSize: 11, fontWeight: 500, color: SUBTLE }}> BWP</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: SUBTLE }}>1 CAD = {rate(props.rateValue)} BWP · Within minutes · Fee 0.00 CAD</div>
        {props.note}
      </div>
      <input
        type="radio"
        name="receive"
        checked={selected}
        disabled={disabled}
        onChange={props.onSelect}
        style={{ width: 20, height: 20, accentColor: MG_RED, margin: '2px 0 0', flex: 'none' }}
      />
    </label>
  )
}

/** Live progress of the anchor leg, with links to the anchor and Stellar. */
function AnchorPanel({ p }: { p: AnchorProgress }) {
  const done = p.status === 'completed' || p.status === 'registered'
  // Keep the progress on screen: it appears below the payment options.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])
  return (
    <div ref={ref} style={{ margin: '14px 16px 0', padding: '12px 14px', background: '#FFFFFF', border: `1px solid ${RULE}`, borderLeft: `4px solid ${done ? '#2E7D32' : MG_RED}`, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <div style={{ fontWeight: 700 }}>
        {done ? '✓ ' : ''}
        {ANCHOR_STATUS[p.status] ?? `Anchor status: ${p.status}`}
      </div>
      <div style={{ color: SUBTLE }}>
        {p.amount} USDC via {ANCHOR_DOMAIN}
        {done && ' · now crediting Boloka'}
      </div>
      {p.url && !done && (
        <a href={p.url} target="mg-anchor" style={{ color: MG_RED, fontWeight: 700 }}>
          Open the anchor window
        </a>
      )}
      {p.stellarTx && (
        <a href={`${EXPLORER}/transactions/${p.stellarTx}`} target="_blank" rel="noreferrer" style={{ color: MG_RED, fontWeight: 700 }}>
          View the anchor's payment on Stellar
        </a>
      )}
    </div>
  )
}

type Receipt = {
  method: Method
  cad: number
  bwp: number
  rate: number
  reference: string
  date: Date
}

const RATES: Record<Method, number> = { boloka: BOLOKA_RATE, orange: ORANGE_RATE, cash: CASH_RATE }

function receiptFor(method: Method, cad: number): Receipt {
  const rate = RATES[method]
  return {
    method,
    cad,
    rate,
    bwp: cad * rate,
    // MoneyGram-style 8-digit reference number.
    reference: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
    date: new Date(),
  }
}

/** MoneyGram's own receipt. The sender never leaves MoneyGram. */
function Sent({ r, frame, onAgain }: { r: Receipt; frame: CSSProperties; onAgain: () => void }) {
  const delivered = r.method === 'boloka' || r.method === 'orange'
  const rows: [string, ReactNode][] = [
    ['You sent', `$${money(r.cad, 2)} CAD`],
    ['Transfer fee', '$0.00 CAD'],
    ['Exchange rate', `1 CAD = ${rate(r.rate)} BWP`],
    [`${RECEIVER} receives`, <strong key="b">{money(r.bwp, 2)} BWP</strong>],
    ['Delivered to', r.method === 'boloka' ? 'Boloka · Dollar savings' : NAMES[r.method]],
    ['Reference number', <span key="r" style={{ fontFamily: 'Menlo, monospace', letterSpacing: 1 }}>{r.reference.replace(/(\d{4})(\d{4})/, '$1 $2')}</span>],
    ['Date', r.date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })],
  ]
  return (
    <div className="app-frame" style={frame}>
      <Header />
      <div style={{ display: 'flex', background: '#FFFFFF', borderBottom: `1px solid ${RULE}`, padding: '12px 16px', gap: 6 }}>
        {['Amount', 'Delivery', 'Payment', 'Review'].map((label) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 4, borderRadius: 2, background: MG_RED }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: SUBTLE }}>✓ {label}</span>
          </div>
        ))}
      </div>

      <div style={{ ...section, marginTop: 16, padding: '28px 16px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2E7D32', color: '#FFFFFF', fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'mg-pop 360ms ease-out' }}>✓</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{delivered ? 'Money delivered' : 'Ready for pickup'}</div>
        <div style={{ fontSize: 14, color: SUBTLE, lineHeight: 1.5, maxWidth: 300 }}>
          {r.method === 'boloka'
            ? `${RECEIVER} has been notified in the Boloka app.`
            : r.method === 'orange'
              ? `${RECEIVER} has been notified by Orange Money.`
              : `${RECEIVER} can collect it at any MoneyGram agent in Botswana.`}
        </div>
      </div>

      <div style={sectionTitle}>Transfer details</div>
      <div style={section}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: i < rows.length - 1 ? `1px solid ${RULE}` : undefined, fontSize: 14 }}>
            <span style={{ color: SUBTLE }}>{k}</span>
            <span style={{ textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" onClick={onAgain} style={{ height: 50, border: 'none', borderRadius: 4, background: MG_RED, color: '#FFFFFF', font: `700 14px ${MG_FONT}`, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}>
          Send again
        </button>
        <button type="button" style={{ height: 50, border: `2px solid ${MG_RED}`, borderRadius: 4, background: '#FFFFFF', color: MG_RED, font: `700 14px ${MG_FONT}`, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}>
          Share receipt
        </button>
      </div>
    </div>
  )
}

const iconBox = (bg: string, children: ReactNode) => (
  <div style={{ width: 36, height: 36, borderRadius: 4, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
    {children}
  </div>
)

export default function SenderSend() {
  usePageMeta('MoneyGram — Send money', '/moneygram.svg')
  const [text, setText] = useState('1,000.00')
  const [picked, setPicked] = useState<Method>('boloka')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Receipt | null>(null)
  const [editing, setEditing] = useState(false)
  const [viaAnchor, setViaAnchor] = useState(true)
  const [anchor, setAnchor] = useState<AnchorProgress | null>(null)

  // Set the sender up while they fill in the form; Continue awaits it.
  useEffect(() => {
    setupAccount(senderKeypair()).catch(console.error)
  }, [])

  const cad = parseCad(text)
  const arrives = cad * BOLOKA_RATE
  const overLimit = arrives > PER_TRANSFER_LIMIT
  // Orange Money or Cash pickup picked before the amount went over the limit
  // drops back to Boloka.
  const method: Method = overLimit ? 'boloka' : picked
  const canContinue = !busy && cad > 0

  /**
   * The anchor leg, by the shared standards against ANCHOR_DOMAIN, with no
   * anchor UI: SEP-10 sign-in, the sender's details over SEP-12 (MoneyGram
   * has already verified them), and a SEP-6 deposit of up to 10 USDC. The
   * test anchor registers SEP-6 deposits but never settles them, so the
   * transfer carries on once the anchor has accepted it.
   */
  async function anchorLeg() {
    const kp = senderKeypair()
    const amount = Math.min(ANCHOR_CAP, Math.max(1, Math.floor(cad * USD_PER_CAD))).toString()
    setAnchor({ amount, status: 'connecting' })
    const a = await discover()
    await setupAccount(kp)
    await setupAccount(kp, a.usdc)
    const token = await signIn(a, kp)
    setAnchor({ amount, status: 'kyc' })
    // The sender's MoneyGram profile (test details).
    await sendCustomer(a, token, kp.publicKey(), {
      first_name: 'Kate',
      last_name: 'Test',
      email_address: 'lerato.test@example.com',
      address_country_code: 'CAN',
    })
    setAnchor({ amount, status: 'registering' })
    await registerDeposit(a, token, kp.publicKey(), amount)
    setAnchor({ amount, status: 'registered' })
  }

  async function send() {
    setError('')
    setAnchor(null)
    const anchored = method === 'boloka' && viaAnchor
    try {
      if (method === 'boloka') {
        const kp = senderKeypair()
        if (anchored) {
          setBusy('Paying through anchor…')
          await anchorLeg()
        }
        setBusy('Setting up…')
        await setupAccount(kp)
        setBusy('Sending…')
        // Lands in the receiver's Boloka app, which is a different app: the
        // sender stays in MoneyGram and sees MoneyGram's own receipt.
        await depositForReceiver(
          kp,
          BigInt(Math.round(cad * USD_PER_CAD * 1e7)),
          { sender: 'Kate', via: 'MoneyGram' },
        )
      } else {
        setBusy('Sending…')
        await new Promise((r) => setTimeout(r, 1500))
      }
      setSent(receiptFor(method, cad))
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : ''
      setError(
        msg.startsWith('Anchor')
          ? `${msg}. Nothing was sent.`
          : 'We couldn’t complete this transfer. Please try again.',
      )
    } finally {
      setBusy('')
    }
  }

  const frame: CSSProperties = {
    width: 390,
    minHeight: 844,
    margin: '0 auto',
    background: PAGE,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: MG_FONT,
    color: TEXT,
    position: 'relative',
  }

  if (sent) return <Sent r={sent} frame={frame} onAgain={() => setSent(null)} />

  return (
    <div className="app-frame" style={frame}>
      <Header />
      <Steps />

      <div style={{ flex: 1, paddingBottom: 120 }}>
        <div style={sectionTitle}>Sending to</div>
        <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E9E9E9', color: TEXT, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>MK</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{RECEIVER}</div>
            <div style={{ fontSize: 13, color: SUBTLE }}>Botswana · receives BWP</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: MG_RED }}>Edit</span>
        </div>

        <div style={sectionTitle}>You send</div>
        <div style={{ ...section, padding: '14px 16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: `2px solid ${editing ? MG_RED : '#BDBDBD'}`,
              borderRadius: 4,
              padding: '10px 12px',
              cursor: 'text',
              background: '#FFFFFF',
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 700, color: SUBTLE }}>$</span>
            <input
              aria-label="Amount in CAD"
              inputMode="decimal"
              placeholder="0.00"
              value={text}
              onFocus={(e) => {
                setEditing(true)
                e.currentTarget.select()
              }}
              onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={() => {
                setEditing(false)
                if (cad > 0) setText(money(cad, 2))
              }}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: `700 26px ${MG_FONT}`, color: TEXT, padding: 0 }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, background: '#EFEFEF', borderRadius: 3, padding: '4px 8px' }}>CAD</span>
          </label>
          <div style={{ fontSize: 12, color: SUBTLE, marginTop: 8 }}>
            Tap the amount to change it.
          </div>
        </div>

        <div style={sectionTitle}>How you pay</div>
        <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          {iconBox('#EFEFEF', <span style={{ fontSize: 16 }}>🏦</span>)}
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Bank account · RBC •• 2210</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: MG_RED }}>Change</span>
        </div>

        <div style={sectionTitle}>How they receive</div>
        <div style={section}>
          <MethodRow
            selected={method === 'boloka'}
            disabled={false}
            onSelect={() => setPicked('boloka')}
            icon={iconBox('#0E7C5B', <span style={{ color: '#FFFFFF', fontWeight: 700 }}>B</span>)}
            name="Dollar savings · Boloka"
            rateValue={BOLOKA_RATE}
            note={
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0E7C5B' }}>
                {overLimit
                  ? `No limit · P ${money(arrives, 0)} arrives as dollar savings`
                  : 'Best rate · no limit · holds value in dollars · earns interest'}
              </div>
            }
          />
          <MethodRow
            selected={method === 'orange'}
            disabled={overLimit}
            onSelect={() => setPicked('orange')}
            icon={iconBox(
              '#F26B1D',
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="20" rx="2" />
                <path d="M10 18h4" />
              </svg>,
            )}
            name="Mobile wallet · Orange Money"
            rateValue={ORANGE_RATE}
            note={
              overLimit ? (
                <div style={{ fontSize: 12, fontWeight: 700, color: MG_RED_DARK }}>Over the limit — P {money(PER_TRANSFER_LIMIT, 0)} per transfer (Orange Money's own limit: P {money(ORANGE_LIMIT, 0)})</div>
              ) : (
                <div style={{ fontSize: 12, color: SUBTLE }}>Limit P {money(PER_TRANSFER_LIMIT, 0)} per transfer</div>
              )
            }
          />
          <MethodRow
            selected={method === 'cash'}
            disabled={overLimit}
            onSelect={() => setPicked('cash')}
            icon={iconBox(
              '#EFEFEF',
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>,
            )}
            name="Cash pickup"
            rateValue={CASH_RATE}
            note={
              overLimit && (
                <div style={{ fontSize: 12, fontWeight: 700, color: MG_RED_DARK }}>About {HIDDEN_COST * 100}% hidden in the rate · agent may not hold this much cash</div>
              )
            }
            last
          />
        </div>

        {method === 'boloka' && (
          <>
            <div style={sectionTitle}>Settlement</div>
            <label style={{ ...section, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={viaAnchor}
                disabled={!!busy}
                onChange={(e) => setViaAnchor(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: MG_RED, margin: '1px 0 0', flex: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Settle through a Stellar anchor</span>
                <span style={{ fontSize: 12, color: SUBTLE, lineHeight: 1.45 }}>
                  Runs in the background with {ANCHOR_DOMAIN}: SEP-10 sign-in, your verified
                  details over SEP-12, and a SEP-6 deposit. Test anchor leg: up to {ANCHOR_CAP} USDC.
                </span>
              </div>
            </label>
          </>
        )}

        {anchor && <AnchorPanel p={anchor} />}

        {error && (
          <div style={{ margin: '14px 16px 0', padding: '10px 12px', background: MG_TINT, borderLeft: `4px solid ${MG_RED}`, fontSize: 13, fontWeight: 700, color: MG_RED_DARK }}>
            {error}
          </div>
        )}
      </div>

      {/* Sticky summary bar, as on MoneyGram's checkout. */}
      <div style={{ position: 'sticky', bottom: 0, background: '#FFFFFF', borderTop: `1px solid ${RULE}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.08)', padding: '12px 16px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, color: SUBTLE }}>Total to pay</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>${money(cad, 2)} CAD</span>
        </div>
        <button
          type="button"
          disabled={!canContinue}
          onClick={send}
          style={{
            height: 50,
            border: 'none',
            borderRadius: 4,
            background: canContinue ? MG_RED : '#D9A19C',
            color: '#FFFFFF',
            font: `700 14px ${MG_FONT}`,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: canContinue ? 'pointer' : 'default',
          }}
        >
          {busy || 'Continue'}
        </button>
      </div>
    </div>
  )
}
