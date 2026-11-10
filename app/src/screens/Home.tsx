// docs/boloka-1-home.html
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSavings, type Activity } from '../savings.tsx'
import { monthlyGrowth } from '../money.ts'
import { FEATURES } from '../features.ts'
import { useYield } from '../yield.ts'
import { GREEN, INK, LINE, MUTED, PANEL, TINT, amt, button, Frame, sectionLabel, when, usePageMeta, HOME } from '../ui.tsx'

function RecentItem({ a }: { a: Activity }) {
  const incoming = a.kind === 'in'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: PANEL, borderRadius: 14 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: incoming ? TINT : '#FDEBDD',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        {incoming ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="M5 12l7 7 7-7" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4510A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M19 12l-7-7-7 7" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {incoming ? `Money from ${a.title}` : `To ${a.title}`}
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>
          {when(a.date)}
          {a.pending && <span style={{ color: incoming ? GREEN : '#C4510A', fontWeight: 600 }}> · {incoming ? 'on its way' : 'sending'}</span>}
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: incoming ? GREEN : undefined }}>
        {incoming ? '+' : '−'}P {amt(a.pula)}
      </div>
    </div>
  )
}

const navItem = (active: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: active ? GREEN : MUTED,
  textDecoration: 'none',
  minWidth: 44,
  minHeight: 44,
  justifyContent: 'center',
})

const navIcon = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export default function Home() {
  usePageMeta('Boloka — Home')
  const s = useSavings()
  const loading = s.status === 'loading'
  // "Growing": one month at Blend's real, measured supply rate.
  const apr = useYield()?.apr ?? null
  const growth = loading ? null : monthlyGrowth(s.balance, apr)
  const navigate = useNavigate()
  const whole = (n: number) => Math.round(n).toLocaleString('en-US')

  return (
    <Frame gap={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: GREEN, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
            M
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Dumela, Mom</div>
        </div>
        <button type="button" aria-label="Settings" style={{ width: 44, height: 44, border: 'none', background: PANEL, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      <div style={{ background: GREEN, borderRadius: 20, padding: '24px 22px', color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>Dollar savings</div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>
          P {loading ? <span style={{ opacity: 0.45, animation: 'soft-pulse 1.2s ease-in-out infinite' }}>· · ·</span> : whole(s.balance)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Held in US dollars · shown in pula</div>
        <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, width: 'fit-content' }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16l6-6 4 4 6-6" />
          </svg>
          {growth === null ? 'Growing' : `+P ${whole(growth)} this month`}
        </div>
      </div>

      {/* One action: Withdraw (to bank / school or Orange Money, chosen next). */}
      <button type="button" style={{ ...button.dark, width: '100%' }} onClick={() => navigate('/orange')}>
        Withdraw
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={sectionLabel}>Recent</div>
        {loading ? (
          <div style={{ fontSize: 13, color: MUTED, animation: 'soft-pulse 1.2s ease-in-out infinite' }}>Loading…</div>
        ) : s.activity.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTED }}>Nothing yet. Money you receive shows up here.</div>
        ) : (
          s.activity.slice(0, 3).map((a) => <RecentItem key={a.id} a={a} />)
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-around', paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
        <Link to={HOME} aria-label="Home" style={navItem(true)}>
          <svg aria-hidden="true" {...navIcon}>
            <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
          </svg>
          Home
        </Link>
        {FEATURES.drip && <Link to="/drip" aria-label="Drip" style={navItem(false)}>
          <svg aria-hidden="true" {...navIcon}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Drip
        </Link>}
        {FEATURES.privacy && <Link to="/private" aria-label="Private" style={navItem(false)}>
          <svg aria-hidden="true" {...navIcon}>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Private
        </Link>}
        <span aria-label="Help" style={navItem(false)}>
          <svg aria-hidden="true" {...navIcon}>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" />
            <path d="M12 17h.01" />
          </svg>
          Help
        </span>
      </div>
    </Frame>
  )
}
