// docs/boloka-5-private.html (static)
import type { ReactNode } from 'react'
import { GREEN, LINE, MUTED, PANEL, TINT, BackHeader, Frame, inlineLink, usePageMeta } from '../ui.tsx'

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: GREEN, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Point({ glyph, title, children }: { glyph: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', background: PANEL, borderRadius: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {glyph}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{children}</div>
      </div>
    </div>
  )
}

export default function Private() {
  usePageMeta('Boloka — Your privacy')
  return (
    <Frame gap={22}>
      <BackHeader title="Your privacy" />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0 4px', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Nobody can look up your savings</div>
        <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, maxWidth: 320 }}>
          Your money sits in one shared account with thousands of other families. Anyone
          looking from outside sees the total for everyone, never your share.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Point
          title="Your balance is hidden"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M17 11V7a5 5 0 0 0-10 0" />
              <rect x="3" y="11" width="18" height="10" rx="2" />
            </svg>
          }
        >
          Not from Boloka's screen, not from the bank, not from anyone with your phone number.
        </Point>
        <Point
          title="Who sends you money is hidden"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
              <path d="M3 3l18 18" />
            </svg>
          }
        >
          Nobody can see that Kate sends you money, or how much, or how often.
        </Point>
        <Point
          title="You choose what to prove"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          }
        >
          When you show a lender, they learn one fact you pick, such as "receives at least P
          5,000 a month," and nothing else.
        </Point>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: `1.5px solid ${LINE}`, borderRadius: 14 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Trusted people</div>
          <div style={{ fontSize: 13, color: MUTED }}>
            Thabo (son) and Mma Dineo can restore your account if you lose your phone
          </div>
        </div>
        <span style={inlineLink}>Edit</span>
      </div>

      <div style={{ marginTop: 'auto', fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
        Boloka never sells or shares your information.
      </div>
    </Frame>
  )
}
