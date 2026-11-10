// The root of the single-URL build. On a wide screen the three apps run side
// by side as phones (MoneyGram, Boloka, the bank), so money sent in one is
// seen arriving in the next without switching windows; one under-the-hood
// strip sits below them. Narrow screens get the three apps as cards to open.
// Not a parents' screen.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { FONT, GREEN, INK, LINE, MUTED, PANEL, usePageMeta } from '../ui.tsx'

type Mode = 'testnet' | 'demo'

const APPS: { n: number; name: string; who: string; href: string; icon: string; bg: string }[] = [
  { n: 1, name: 'MoneyGram', who: 'Kate sends $10,000 CAD from Canada', href: '/moneygram', icon: '/icons/moneygram-180.png', bg: '#DA291C' },
  { n: 2, name: 'Boloka', who: 'Her parents save it in dollars, in Botswana', href: '/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { n: 3, name: 'Kalahari Bank', who: 'The school fee lands in the bank', href: '/bank', icon: '/icons/bank-180.png', bg: '#0B2545' },
]

const PHONE_W = 390
const PHONE_H = 760
/** Three phones, gaps and margins. */
const WIDE = 3 * PHONE_W + 2 * 28 + 48

const card: CSSProperties = { background: '#FFFFFF', borderRadius: 18, border: `1px solid ${LINE}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= WIDE)
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= WIDE)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return wide
}

/** A phone-shaped frame running one of the apps. */
function Phone({ app }: { app: (typeof APPS)[number] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
        <img src={app.icon} alt="" width={30} height={30} style={{ borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{app.name}</div>
          <div style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.who}</div>
        </div>
        <a href={app.href} target={`boloka-${app.n}`} title="Open in its own window" style={{ fontSize: 12, fontWeight: 600, color: GREEN, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          own window ↗
        </a>
      </div>
      <div style={{ width: PHONE_W + 16, height: PHONE_H + 16, padding: 8, borderRadius: 40, background: '#0F1412', boxShadow: '0 20px 50px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <iframe
          title={app.name}
          src={`${app.href}?embed=1`}
          style={{ width: PHONE_W, height: PHONE_H, border: 'none', borderRadius: 32, background: '#FFFFFF', display: 'block' }}
        />
      </div>
    </div>
  )
}

export default function Launcher({ mode, strip }: { mode: Mode; strip?: ReactNode }) {
  usePageMeta('Boloka — Demo')
  const wide = useWide()
  return (
    <div style={{ minHeight: '100vh', background: PANEL, fontFamily: FONT, color: INK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Boloka</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: PANEL, borderRadius: 999, padding: '4px 10px' }}>
          {mode === 'testnet' ? 'Live on Stellar testnet' : 'Simulated demo'}
        </span>
        <span style={{ flex: 1 }} />
        <a href="/how-it-works" style={{ fontSize: 14, fontWeight: 600, color: GREEN, textDecoration: 'none' }}>How it works →</a>
        <a href="/admin" style={{ fontSize: 14, fontWeight: 600, color: GREEN, textDecoration: 'none', marginLeft: 18 }}>Pool admin →</a>
      </div>

      <div style={{ maxWidth: wide ? WIDE : 980, margin: '0 auto', padding: wide ? '28px 24px 48px' : '48px 20px 60px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1, width: '100%', boxSizing: 'border-box', justifyContent: wide ? 'flex-start' : 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: wide ? 26 : 30, letterSpacing: -0.4, lineHeight: 1.2 }}>
            Dollar savings for families in Botswana receiving money from abroad
          </h1>
          <div style={{ fontSize: 15, color: MUTED }}>
            {wide ? 'Three apps, live, left to right: send in MoneyGram, watch it arrive in Boloka, pay the school fee into the bank.' : 'Three apps. Open them in order.'}
          </div>
        </div>

        {wide ? (
          <>
            <div style={{ display: 'flex', gap: 28, justifyContent: 'center', alignItems: 'flex-start' }}>
              {APPS.map((a) => (
                <Phone key={a.name} app={a} />
              ))}
            </div>
            {strip}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {APPS.map((a) => (
                <div key={a.name} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={a.icon} alt="" width={44} height={44} style={{ borderRadius: 11 }} />
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>App {a.n}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{a.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, flex: 1 }}>{a.who}</div>
                  <a href={a.href} target={`boloka-${a.n}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, background: a.bg, color: '#FFFFFF', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
                    Open {a.name}
                  </a>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: MUTED }}>On a wider screen the three apps appear side by side.</div>
          </>
        )}
      </div>
    </div>
  )
}
