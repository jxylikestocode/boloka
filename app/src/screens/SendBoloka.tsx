// Sending savings to someone else's Boloka: the dollars stay in the pool and
// keep earning; the transfer is a zero-knowledge spend, so nobody outside the
// two phones learns who paid whom or how much. Parents' screen: plain words.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavings, type Payee, type TransferReceipt } from '../savings.tsx'
import { decodeId } from '../notes.ts'
import { PROFILE } from '../profile.ts'
import { directory } from '../wallet.ts'
import {
  BORDER, FONT, GREEN, INK, MUTED, RED, TINT,
  amt, BackHeader, button, disabledStyle, Frame, Row, Rows,
  usePageMeta, HOME } from '../ui.tsx'

const parse = (t: string) => Number(t.replace(/,/g, '')) || 0
const QUICK = [1_000, 3_000, 5_000]

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: GREEN, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, flex: 'none' }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function PayeeRow({ p, on, onPick }: { p: Payee; on: boolean; onPick: () => void }) {
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
      <Avatar name={p.name} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
        <div style={{ fontSize: 12, color: MUTED }}>Boloka savings · arrives in seconds</div>
      </div>
      <input type="radio" name="payee" checked={on} onChange={onPick} style={{ width: 20, height: 20, accentColor: GREEN, margin: 0 }} />
    </label>
  )
}

export default function SendBoloka() {
  const s = useSavings()
  const [payees, setPayees] = useState<Payee[]>([])
  const [to, setTo] = useState<Payee | null>(null)
  const [other, setOther] = useState(false)
  const [idText, setIdText] = useState('')
  const [text, setText] = useState(amt(QUICK[0]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<TransferReceipt | null>(null)
  usePageMeta(receipt ? 'Boloka — Sent' : 'Boloka — Private transfer')

  // Family with Boloka, as the demo's directory knows them (everyone but this phone).
  useEffect(() => {
    directory().then((entries) => {
      const list = entries
        .filter((e) => e.profile !== PROFILE)
        .map((e) => ({ name: e.name, recipient: decodeId(e.id) }))
        .filter((p): p is Payee => p.recipient !== null)
      setPayees(list)
      setTo((cur) => cur ?? list[0] ?? null)
    })
  }, [])

  if (receipt) return <Confirmation r={receipt} />

  const typed = other ? decodeId(idText) : null
  const payee: Payee | null = other ? (typed ? { name: 'Boloka account', recipient: typed } : null) : to
  const pula = parse(text)
  const over = pula > s.balance
  const canSend = pula > 0 && !over && payee !== null && !busy

  async function send() {
    if (!payee) return
    setBusy(true)
    setError('')
    try {
      setReceipt(await s.transfer(pula, payee))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame gap={20}>
      <BackHeader title="Private transfer" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>To</div>
        {payees.map((p) => (
          <PayeeRow key={p.name} p={p} on={!other && to?.name === p.name} onPick={() => { setOther(false); setTo(p) }} />
        ))}
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 14, cursor: 'pointer', ...(other ? { border: `2px solid ${GREEN}`, background: TINT } : { border: `1.5px solid ${BORDER}`, background: '#FFFFFF' }) }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Someone else</div>
              <div style={{ fontSize: 12, color: MUTED }}>Paste their Boloka ID (in their Settings)</div>
            </div>
            <input type="radio" name="payee" checked={other} onChange={() => setOther(true)} style={{ width: 20, height: 20, accentColor: GREEN, margin: 0 }} />
          </div>
          {other && (
            <input
              type="text"
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              placeholder="BLK…"
              spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', height: 40, borderRadius: 10, border: `1.5px solid ${idText && !typed ? RED : BORDER}`, padding: '0 12px', font: `500 13px ${FONT}`, color: INK, background: '#FFFFFF', outline: 'none' }}
            />
          )}
        </label>
        {payees.length === 0 && !other && (
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Nobody in your family has opened Boloka on this demo yet. Open the other phone once, or paste a Boloka ID.</div>
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
          No fee, no limit · P {amt(s.balance)} available
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setText(amt(q))} style={{ flex: 1, height: 44, border: `1.5px solid ${BORDER}`, borderRadius: 999, background: '#FFFFFF', font: `600 14px ${FONT}`, color: INK, cursor: 'pointer' }}>
            P {amt(q)}
          </button>
        ))}
      </div>

      <Rows>
        <Row label="You send" value={`P ${amt(pula)}`} />
        <Row label="Fee" value="P 0.00" />
        <Row label="Stays in" value="US dollars, still earning" />
        <Row
          label={`Arrives in ${payee?.name ?? 'their'} Boloka`}
          value={`P ${amt(pula)}`}
          fontSize={15}
          labelStyle={{ color: INK, fontWeight: 600 }}
          valueStyle={{ fontWeight: 700, color: GREEN }}
          last
        />
      </Rows>

      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        Only you and {payee?.name ?? 'they'} can see this transfer: not the bank, not anyone looking at Boloka from outside.
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}
        <button type="button" disabled={!canSend} onClick={send} style={{ ...button.green, width: '100%', ...(canSend ? {} : disabledStyle) }}>
          {busy ? 'Sending…' : `Send P ${amt(pula)}${payee ? ` to ${payee.name}` : ''}`}
        </button>
      </div>
    </Frame>
  )
}

/** Receipt once the transfer is on its way. */
function Confirmation({ r }: { r: TransferReceipt }) {
  const navigate = useNavigate()
  const date = new Date(r.date).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <Frame gap={22}>
      <BackHeader title="Sent" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0 8px' }}>
        <Avatar name={r.to} size={72} />
        <div style={{ fontSize: 15, color: MUTED }}>Sent to {r.to}</div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -0.5 }}>P {amt(r.pula)}</div>
        <div style={{ fontSize: 13, color: MUTED }}>in their Boloka savings, still in dollars</div>
      </div>
      <Rows>
        <Row label="Amount" value={`P ${amt(r.pula)}`} />
        <Row label="Fee" value="P 0.00" />
        <Row label="To" value={`${r.to} · Boloka`} />
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
