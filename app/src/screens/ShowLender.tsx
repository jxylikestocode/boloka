// docs/boloka-6-show-a-lender.html
import { useState } from 'react'
import { useSavings } from '../savings.tsx'
import { monthOf } from '../proof.ts'
import {
  BORDER, FONT, GREEN, INK, MUTED, RED, TINT,
  amt, BackHeader, button, disabledStyle, Frame, monthLabel, Row, Rows, sectionLabel,
  usePageMeta,
} from '../ui.tsx'

const THRESHOLD = 5000

const CLAIMS = [
  `I receive at least P ${amt(THRESHOLD)} every month`,
  'I have received money for at least 6 months',
  'My savings are above P 10,000',
]

export default function ShowLender() {
  usePageMeta('Boloka — Show a lender')
  const s = useSavings()
  const [claim, setClaim] = useState(0)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function create() {
    setError('')
    if (claim !== 0) {
      setError('This proof is not available yet. Choose the monthly income proof.')
      return
    }
    setBusy(true)
    try {
      const c = await s.proofCode(THRESHOLD)
      if (c) setCode(c)
      else setError(`Less than P ${amt(THRESHOLD)} has arrived this month.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!code) return
    // Never fail on camera: fall back to selecting the code and the old copy
    // command if the clipboard API refuses (e.g. the window lost focus).
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const box = document.getElementById('code') as HTMLTextAreaElement | null
      box?.select()
      document.execCommand('copy')
    }
    setCopied(true)
  }

  return (
    <Frame gap={22}>
      <BackHeader title="Show a lender" />

      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
        Prove one fact about your income without showing statements, names or amounts. The
        lender sees only a yes.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>What to prove</div>
        {CLAIMS.map((text, i) => {
          const on = claim === i
          return (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                minHeight: 44,
                ...(on
                  ? { border: `2px solid ${GREEN}`, background: TINT }
                  : { border: `1.5px solid ${BORDER}` }),
              }}
            >
              <input
                type="radio"
                name="claim"
                checked={on}
                onChange={() => {
                  setClaim(i)
                  setCode(null)
                  setError('')
                }}
                style={{ width: 20, height: 20, accentColor: GREEN }}
              />
              <span style={{ fontSize: 15, fontWeight: on ? 600 : 500 }}>{text}</span>
            </label>
          )
        })}
      </div>

      <Rows>
        <Row label="Period checked" value={monthLabel(monthOf())} />
        <Row label="Lender sees" value="Yes / No only" valueStyle={{ color: GREEN }} />
        <Row label="Lender does not see" value="Sender, amounts, history" last />
      </Rows>

      {code ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="code" style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
            Your proof code
          </label>
          <textarea
            id="code"
            readOnly
            rows={3}
            value={code}
            onFocus={(e) => e.currentTarget.select()}
            style={{ border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '12px 14px', font: '500 12px ui-monospace, SFMono-Regular, Menlo, monospace', color: INK, background: '#FFFFFF', resize: 'none', wordBreak: 'break-all' }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="lender" style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
            Share with
          </label>
          <select
            id="lender"
            style={{ height: 52, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '0 14px', font: `500 15px ${FONT}`, color: INK, background: '#FFFFFF' }}
          >
            <option>Letshego Microfinance</option>
            <option>Another lender (enter code)</option>
          </select>
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}
        {code ? (
          <button type="button" style={button.green} onClick={copy}>
            {copied ? 'Copied — paste it to your lender' : 'Copy proof code'}
          </button>
        ) : (
          <button
            type="button"
            style={{ ...button.green, ...(busy ? disabledStyle : {}) }}
            disabled={busy}
            onClick={create}
          >
            {busy ? 'Creating proof…' : 'Create proof and share'}
          </button>
        )}
        <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
          The proof expires in 30 days. You can cancel it any time.
        </div>
      </div>
    </Frame>
  )
}
