// docs/lender-portal.html
import { useState, type CSSProperties } from 'react'
import { verifyProofCode, type Verdict } from '../verify.ts'
import {
  BORDER, FONT, GREEN, INK, LINE, MUTED, PANEL, RED, TINT,
  amt, disabledStyle, monthLabel,
  usePageMeta,
} from '../ui.tsx'

const card: CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: 32,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}
const fieldLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: MUTED }
const field: CSSProperties = {
  height: 52,
  border: `1.5px solid ${BORDER}`,
  borderRadius: 12,
  padding: '0 16px',
  font: `500 16px ${FONT}`,
  color: INK,
  outline: 'none',
  background: '#FFFFFF',
}

function DetailRow({ label, value, last, valueColor }: { label: string; value: string; last?: boolean; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: last ? undefined : `1px solid ${LINE}`, fontSize: 14 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: valueColor }}>{value}</span>
    </div>
  )
}

function Approved({ v, reference }: { v: Extract<Verdict, { ok: true }>; reference: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>Verified · APPROVED</div>
          <div style={{ fontSize: 13, color: MUTED }}>Checked on the ledger just now</div>
        </div>
      </div>

      <div style={{ border: `1.5px solid ${LINE}`, borderRadius: 14, padding: '4px 18px' }}>
        <DetailRow label="Fact proven" value={`Receives at least P ${amt(v.claim)} every month`} />
        <DetailRow label="Period" value={monthLabel(v.month)} />
        <DetailRow label="Source of record" value="Boloka savings pool, Stellar" />
        <DetailRow label="Valid until" value="6 Dec 2026" />
        <DetailRow label="Not disclosed" value="Sender · amounts · balance · history" valueColor={MUTED} last />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" style={{ flex: 1, height: 48, border: 'none', borderRadius: 12, background: INK, color: '#FFFFFF', font: `600 14px ${FONT}`, cursor: 'pointer' }}>
          Attach to {reference || 'application'}
        </button>
        <button type="button" style={{ flex: 1, height: 48, border: `1.5px solid ${BORDER}`, borderRadius: 12, background: '#FFFFFF', color: INK, font: `600 14px ${FONT}`, cursor: 'pointer' }}>
          Download certificate
        </button>
      </div>

      <div style={{ marginTop: 'auto', padding: '14px 16px', background: PANEL, borderRadius: 12, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
        Remittance income is not yet counted by most Botswana lenders. This proof gives you a
        verifiable record to count it on your own terms.
      </div>
    </div>
  )
}

function NotVerified({ reason }: { reason: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FBE9E7', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: RED }}>Not verified</div>
          <div style={{ fontSize: 13, color: MUTED }}>Checked on the ledger just now</div>
        </div>
      </div>
      <div style={{ padding: '14px 16px', background: PANEL, borderRadius: 12, fontSize: 14, lineHeight: 1.5 }}>
        {reason}
      </div>
    </div>
  )
}

const navLink = (active: boolean): CSSProperties => ({
  textDecoration: 'none',
  color: active ? GREEN : MUTED,
  cursor: 'pointer',
})

export default function Lender() {
  usePageMeta('Boloka for Lenders — Verify a proof')
  const [code, setCode] = useState('')
  const [reference, setReference] = useState('LOAN-2026-01184')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  async function check() {
    setBusy(true)
    setVerdict(null)
    try {
      setVerdict(await verifyProofCode(code.trim()))
    } catch (e) {
      console.error(e)
      setVerdict({ ok: false, reason: 'The check could not be completed. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const canVerify = !busy && code.trim() !== ''

  return (
    <div className="design" style={{ minHeight: '100vh', boxSizing: 'border-box', background: PANEL, display: 'flex', flexDirection: 'column', fontFamily: FONT, color: INK, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ height: 64, background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>B</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Boloka for Lenders</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14, fontWeight: 500 }}>
          <a href="/lender" style={navLink(true)}>Verify a proof</a>
          <span style={navLink(false)}>History</span>
          <span style={navLink(false)}>Settings</span>
          <div style={{ padding: '8px 12px', background: PANEL, borderRadius: 999, fontSize: 13 }}>Letshego Microfinance</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, padding: 40, maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Verify an income proof</h1>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              Paste the code the applicant shared from Boloka. The check runs against the
              public ledger; Boloka never sees this request.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="code" style={fieldLabel}>Proof code</label>
            <input
              id="code"
              type="text"
              placeholder="Paste proof code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setVerdict(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && canVerify && check()}
              style={{ ...field, letterSpacing: 1 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="applicant" style={fieldLabel}>Applicant reference (your own)</label>
            <input
              id="applicant"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              style={field}
            />
          </div>
          <button
            type="button"
            disabled={!canVerify}
            onClick={check}
            style={{ height: 52, border: 'none', borderRadius: 12, background: GREEN, color: '#FFFFFF', font: `600 15px ${FONT}`, cursor: 'pointer', ...(canVerify ? {} : disabledStyle) }}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            You receive a yes or no for the fact the applicant chose to prove. You never
            receive their balance, their transaction history, or who sends them money.
          </div>
        </div>

        {verdict &&
          (verdict.ok ? (
            <Approved v={verdict} reference={reference} />
          ) : (
            <NotVerified reason={verdict.reason} />
          ))}
      </div>
    </div>
  )
}
