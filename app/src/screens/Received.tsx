// docs/boloka-2-received.html
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { markSeen } from '../seen.ts'
import { useSavings } from '../savings.tsx'
import { GREEN, INK, LINE, MUTED, TINT, amt, BackHeader, button, Frame, Row, Rows, when, usePageMeta, HOME } from '../ui.tsx'

export default function Received() {
  usePageMeta('Boloka — Money received')
  const s = useSavings()
  const navigate = useNavigate()
  const id = (useLocation().state as { id?: string } | null)?.id
  // The deposit just made, or else the latest one.
  const item =
    s.activity.find((a) => a.id === id) ?? s.activity.find((a) => a.kind === 'in')

  useEffect(() => {
    if (item) markSeen(item.id)
  }, [item])

  if (!item) {
    return (
      <Frame gap={24}>
        <BackHeader title="Money received" />
        <div style={{ fontSize: 15, color: MUTED }}>Nothing has arrived yet.</div>
        <Link to={HOME} style={{ ...button.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          Home
        </Link>
      </Frame>
    )
  }

  return (
    <Frame gap={24}>
      <BackHeader title="Money received" />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0 8px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div style={{ fontSize: 15, color: MUTED }}>
          Money from <strong style={{ color: INK }}>{item.title}</strong> arrived
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -0.5 }}>P {amt(item.pula)}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{when(item.date)} · Sent from Canada</div>
      </div>

      <Rows>
        <Row label="Added to" value="Dollar savings" />
        <Row label="New balance" value={`P ${amt(s.balance)}`} />
        <Row label="Sent via" value={item.detail} />
        <Row label="Limit" value="None" valueStyle={{ color: GREEN }} last />
      </Rows>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', border: `1.5px solid ${LINE}`, borderRadius: 14 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 2 }}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: MUTED }}>
          This money is held in US dollars, so it keeps its value while the pula moves. It
          earns interest until you spend it. Nobody can look up how much you have.
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" style={button.dark} onClick={() => navigate(HOME)}>
          Keep it saved
        </button>
        <button type="button" style={button.outline} onClick={() => navigate('/orange')}>
          Withdraw
        </button>
      </div>
    </Frame>
  )
}
