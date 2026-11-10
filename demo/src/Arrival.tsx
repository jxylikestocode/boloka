// Demo build: a phone-style notification when money from MoneyGram lands
// while Boloka is open. Tapping it opens the "Money received" screen.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSavings } from './savings.tsx'
import { markSeen, seen } from './seen.ts'
import { amt, FONT, GREEN, INK, MUTED } from './ui.tsx'

export default function Arrival() {
  const s = useSavings()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState<string | null>(null)
  // The newest transfer not yet opened, if it came in the last 2 minutes:
  // arriving while Boloka is open, or just before it was opened.
  const latest = s.activity.find(
    (a) => a.kind === 'in' && !seen().has(a.id) && Date.now() - Date.parse(a.date) < 120_000,
  )

  // Re-check every few seconds so a stale notification goes away.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  if (!latest || latest.id === dismissed || pathname === '/received') return null

  const open = () => {
    markSeen(latest.id)
    navigate('/received', { state: { id: latest.id } })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 366,
        zIndex: 50,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px',
        borderRadius: 18,
        background: 'rgba(250,250,250,0.96)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        font: `500 14px ${FONT}`,
        color: INK,
        cursor: 'pointer',
        animation: 'arrival-in 420ms cubic-bezier(.2,.9,.3,1.2)',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 9, background: GREEN, color: '#FFFFFF', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        B
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, fontWeight: 600 }}>
          <span>BOLOKA</span>
          <span>now</span>
        </div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>Money from {latest.title} arrived</div>
        <div style={{ fontSize: 13, color: MUTED }}>P {amt(latest.pula)} added to your dollar savings</div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation()
          markSeen(latest.id)
          setDismissed(latest.id)
        }}
        style={{ border: 'none', background: 'transparent', color: MUTED, fontSize: 18, cursor: 'pointer', padding: 4 }}
      >
        ×
      </button>
    </div>
  )
}
