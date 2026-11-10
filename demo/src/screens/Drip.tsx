// docs/boloka-4-drip.html
import { useState } from 'react'
import { FONT, GREEN, INK, MUTED, PANEL, TINT, BORDER, amt, BackHeader, button, Frame, sectionLabel, usePageMeta } from '../ui.tsx'
import { DESTINATIONS, type Destination } from '../money.ts'

type Schedule = { amount: number; day: number; pauseBelow: number; paused: boolean; dest: Destination }

const KEY = 'savings.drip'
const DAYS = [1, 15, 25]
const DEFAULTS: Schedule = { amount: 3000, day: 1, pauseBelow: 5000, paused: false, dest: 'bank' }

function load(): Schedule {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    if (!(s.dest in DESTINATIONS)) s.dest = DEFAULTS.dest
    return DAYS.includes(s.day) ? s : { ...s, day: DEFAULTS.day }
  } catch {
    return DEFAULTS
  }
}

const ordinal = (d: number) => `${d}${d === 1 ? 'st' : 'th'}`
const parse = (t: string) => Number(t.replace(/[^\d.]/g, '')) || 0

/** The next date after today that falls on `day` of a month: "1 Dec". */
function nextRun(day: number) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const run = new Date(today.getFullYear(), today.getMonth(), day)
  if (run <= today) run.setMonth(run.getMonth() + 1)
  return run.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const fieldRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  background: PANEL,
  borderRadius: 14,
  minHeight: 44,
} as const
const fieldLabel = { fontSize: 14, fontWeight: 600 } as const
const fieldInput = {
  textAlign: 'right',
  border: 'none',
  background: 'transparent',
  font: `600 15px ${FONT}`,
  color: INK,
  outline: 'none',
  padding: 0,
} as const

export default function Drip() {
  usePageMeta('Boloka — Monthly withdrawal')
  const [saved, setSaved] = useState(load)
  const [amountText, setAmountText] = useState(`P ${amt(saved.amount)}`)
  const [day, setDay] = useState(saved.day)
  const [dest, setDest] = useState<Destination>(saved.dest)
  const info = DESTINATIONS[dest]
  const [pauseText, setPauseText] = useState(`P ${amt(saved.pauseBelow)}`)
  const [justSaved, setJustSaved] = useState(false)

  const amount = parse(amountText)
  const pauseBelow = parse(pauseText)
  const current: Schedule = { amount, day, pauseBelow, paused: saved.paused, dest }
  const dirty =
    amount !== saved.amount ||
    day !== saved.day ||
    pauseBelow !== saved.pauseBelow ||
    dest !== saved.dest

  function store(s: Schedule) {
    localStorage.setItem(KEY, JSON.stringify(s))
    setSaved(s)
  }

  function save() {
    store({ ...current, paused: false })
    setJustSaved(true)
  }

  const bullet = (text: string) => (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, color: MUTED, lineHeight: 1.45 }}>
      <span style={{ color: GREEN, fontWeight: 700 }}>•</span>
      {text}
    </div>
  )

  return (
    <Frame gap={22}>
      <BackHeader title="Monthly withdrawal" />

      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
        Boloka sends pula to your bank account or Orange Money automatically. The rest of
        your savings stays in dollars and keeps earning.
      </div>

      <div style={{ background: GREEN, borderRadius: 20, padding: 22, color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Every month on the</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{ordinal(day)}</div>
          <div style={{ fontSize: 15, opacity: 0.9 }}>send</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>P {amt(amount)}</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          to {info.name} {info.account.replace('Cheque account ', '')} · {saved.paused ? 'paused' : `next on ${nextRun(day)}`}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div role="radiogroup" aria-label="Send to" style={{ display: 'flex', gap: 8 }}>
          {(Object.keys(DESTINATIONS) as Destination[]).map((d) => {
            const on = dest === d
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setDest(d)
                  setJustSaved(false)
                }}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 14,
                  cursor: 'pointer',
                  font: `600 14px ${FONT}`,
                  color: INK,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  ...(on
                    ? { border: `2px solid ${GREEN}`, background: TINT }
                    : { border: `1.5px solid ${BORDER}`, background: '#FFFFFF' }),
                }}
              >
                {DESTINATIONS[d].name}
                <span style={{ fontSize: 11, fontWeight: 500, color: MUTED }}>
                  {d === 'bank' ? 'No limit' : 'Up to P 10,000'}
                </span>
              </button>
            )
          })}
        </div>
        <div style={fieldRow}>
          <label htmlFor="amount" style={fieldLabel}>Amount</label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value)
              setJustSaved(false)
            }}
            onBlur={() => setAmountText(`P ${amt(amount)}`)}
            style={{ ...fieldInput, width: 120 }}
          />
        </div>
        <div style={fieldRow}>
          <label htmlFor="day" style={fieldLabel}>Day of month</label>
          <select
            id="day"
            value={day}
            onChange={(e) => {
              setDay(Number(e.target.value))
              setJustSaved(false)
            }}
            style={{ ...fieldInput, textAlign: undefined }}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{ordinal(d)}</option>
            ))}
          </select>
        </div>
        <div style={fieldRow}>
          <label htmlFor="untilw" style={fieldLabel}>Pause when savings fall below</label>
          <input
            id="untilw"
            type="text"
            inputMode="decimal"
            value={pauseText}
            onChange={(e) => {
              setPauseText(e.target.value)
              setJustSaved(false)
            }}
            onBlur={() => setPauseText(`P ${amt(pauseBelow)}`)}
            style={{ ...fieldInput, width: 90 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>What this does</div>
        {dest === 'bank'
          ? bullet('Lands in your bank account the same day, with no transfer limit')
          : bullet("Stays under Orange Money's limits (P 10,000 per transfer, P 30,000 per month), every time")}
        {bullet("The money you haven't sent yet keeps earning interest")}
        {bullet('No trip to town, no agent, no queue')}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          style={button.dark}
          disabled={amount <= 0}
          onClick={save}
        >
          {justSaved && !dirty ? 'Saved' : 'Save schedule'}
        </button>
        <button
          type="button"
          onClick={() => store({ ...saved, paused: !saved.paused })}
          style={{ height: 44, border: 'none', background: 'transparent', color: MUTED, font: `600 14px ${FONT}`, cursor: 'pointer' }}
        >
          {saved.paused ? 'Resume' : 'Pause for now'}
        </button>
      </div>
    </Frame>
  )
}
