// Paying out of savings: to a bank account or the school (default), or to
// Orange Money. Layout from docs/boloka-3-send-to-orange-money.html.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSavings, type SendReceipt } from '../savings.tsx'
import { DESTINATIONS, type Destination } from '../money.ts'
import {
  BORDER, FONT, GREEN, INK, MUTED, RED, TINT,
  amt, BackHeader, BankIcon, button, disabledStyle, Frame, OrangeMoneyIcon, Row, Rows,
  usePageMeta, HOME } from '../ui.tsx'

const ICONS: Record<Destination, () => React.JSX.Element> = { bank: BankIcon, orange: OrangeMoneyIcon }

const parse = (t: string) => Number(t.replace(/,/g, '')) || 0

function DestinationRow({ d, on, onPick }: { d: Destination; on: boolean; onPick: () => void }) {
  const info = DESTINATIONS[d]
  const Icon = ICONS[d]
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        cursor: 'pointer',
        ...(on ? { border: `2px solid ${GREEN}`, background: TINT } : { border: `1.5px solid ${BORDER}`, background: '#FFFFFF' }),
      }}
    >
      <Icon />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{info.action}</div>
        <div style={{ fontSize: 12, color: MUTED }}>
          {info.name} {info.account.replace('Cheque account ', '')} ·{' '}
          {info.limit ? `up to P ${amt(info.limit)}` : 'no limit'}
        </div>
      </div>
      <input
        type="radio"
        name="dest"
        checked={on}
        onChange={onPick}
        style={{ width: 20, height: 20, accentColor: GREEN, margin: 0 }}
      />
    </label>
  )
}

export default function Send() {
  const s = useSavings()
  const [params] = useSearchParams()
  const [dest, setDest] = useState<Destination>(params.get('to') === 'orange' ? 'orange' : 'bank')
  // The bank is the default; "Change" opens the other option.
  const [picking, setPicking] = useState(false)
  const [text, setText] = useState(amt(DESTINATIONS[dest].start))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<SendReceipt | null>(null)
  usePageMeta(receipt ? 'Boloka — Payment sent' : 'Boloka — Withdraw')

  if (receipt) return <Confirmation r={receipt} />

  const info = DESTINATIONS[dest]
  const pula = parse(text)
  const fee = pula > 0 ? info.fee(pula) : 0
  const arrives = pula - fee
  const overLimit = info.limit !== null && pula > info.limit
  const over = overLimit || pula > s.balance
  const canSend = pula > 0 && arrives > 0 && !over && !busy

  async function send() {
    setBusy(true)
    setError('')
    try {
      setReceipt(await s.send(pula, dest))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame gap={20}>
      <BackHeader title="Withdraw" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>Pay out to</div>
        {picking ? (
          (Object.keys(DESTINATIONS) as Destination[]).map((d) => (
            <DestinationRow
              key={d}
              d={d}
              on={dest === d}
              onPick={() => {
                setDest(d)
                setText(amt(DESTINATIONS[d].start))
                setPicking(false)
              }}
            />
          ))
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: '#FFFFFF' }}>
            {(() => {
              const Icon = ICONS[dest]
              return <Icon />
            })()}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{info.name}</div>
              <div style={{ fontSize: 12, color: MUTED }}>
                {info.account} · {info.limit ? `up to P ${amt(info.limit)}` : 'no limit'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPicking(true)}
              style={{ border: 'none', background: 'transparent', color: GREEN, font: `600 14px ${FONT}`, cursor: 'pointer', padding: '8px 0' }}
            >
              Change
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="amt" style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
          Amount in pula
        </label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `2px solid ${INK}`, padding: '6px 0' }}>
          <span style={{ fontSize: 28, fontWeight: 600, color: MUTED }}>P</span>
          <input
            id="amt"
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => pula > 0 && setText(amt(pula))}
            style={{ flex: 1, border: 'none', outline: 'none', font: `700 44px ${FONT}`, color: INK, background: 'transparent', minWidth: 0 }}
          />
        </div>
        <div style={{ fontSize: 13, color: over ? RED : MUTED }}>
          {info.limit
            ? `Up to P ${amt(info.limit)} per transfer (${info.name} limit) · `
            : 'No transfer limit · '}
          P {amt(s.balance)} available
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {info.quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setText(amt(q))}
            style={{ flex: 1, height: 44, border: `1.5px solid ${BORDER}`, borderRadius: 999, background: '#FFFFFF', font: `600 14px ${FONT}`, color: INK, cursor: 'pointer' }}
          >
            P {amt(q)}
          </button>
        ))}
      </div>

      <Rows>
        <Row label="You withdraw" value={`P ${amt(pula)}`} />
        <Row label={info.feeLabel} value={`P ${amt(fee)}`} />
        <Row label="Rate" value="Market rate · no markup" />
        <Row
          label={`Arrives in ${info.name}`}
          value={`P ${amt(Math.max(arrives, 0))}`}
          fontSize={15}
          labelStyle={{ color: INK, fontWeight: 600 }}
          valueStyle={{ fontWeight: 700, color: GREEN }}
          last
        />
      </Rows>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}
        <button
          type="button"
          disabled={!canSend}
          onClick={send}
          style={{ ...button.green, width: '100%', ...(canSend ? {} : disabledStyle) }}
        >
          {busy ? 'Sending…' : `${dest === 'bank' ? 'Pay' : 'Send'} P ${amt(Math.max(arrives, 0))} to ${info.name}`}
        </button>
      </div>
    </Frame>
  )
}

/** Receipt after the withdrawal lands. */
function Confirmation({ r }: { r: SendReceipt }) {
  const navigate = useNavigate()
  const info = DESTINATIONS[r.dest]
  const Icon = ICONS[r.dest]
  const date = new Date(r.date).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <Frame gap={22}>
      <BackHeader title={info.name} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0 8px' }}>
        <div style={{ transform: 'scale(1.6)', margin: '12px 0' }}>
          <Icon />
        </div>
        <div style={{ fontSize: 15, color: MUTED }}>Transfer successful</div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -0.5 }}>P {amt(r.arrives)}</div>
        <div style={{ fontSize: 13, color: MUTED }}>
          {r.dest === 'bank' ? 'on its way to your bank account' : 'received from Dollar savings'}
        </div>
      </div>

      <Rows>
        <Row label="Amount withdrawn" value={`P ${amt(r.pula)}`} />
        <Row label="Fee" value={`P ${amt(r.fee)}`} />
        <Row label="To" value={`${info.name} · ${info.account}`} />
        <Row label="Date" value={date} />
        <Row label="Ref" value={r.reference} last />
      </Rows>

      <div style={{ marginTop: 'auto' }}>
        <button type="button" style={{ ...button.dark, width: '100%' }} onClick={() => navigate(HOME)}>
          Done
        </button>
      </div>
    </Frame>
  )
}
