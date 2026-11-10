// The root of the single-URL build: what Boloka is in one line, and the three
// apps to open. Everything else lives on /how-it-works. Not a parents' screen.
import type { CSSProperties } from 'react'
import { FONT, GREEN, INK, LINE, MUTED, PANEL, usePageMeta } from '../ui.tsx'

type Mode = 'testnet' | 'demo'

const APPS: { n: number; name: string; who: string; href: string; icon: string; bg: string }[] = [
  { n: 1, name: 'MoneyGram', who: 'Kate sends $10,000 CAD from Canada', href: '/moneygram', icon: '/icons/moneygram-180.png', bg: '#DA291C' },
  { n: 2, name: 'Boloka', who: 'Her parents save it in dollars, in Botswana', href: '/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { n: 3, name: 'Kalahari Bank', who: 'The school fee lands in the bank', href: '/bank', icon: '/icons/bank-180.png', bg: '#0B2545' },
]

const card: CSSProperties = { background: '#FFFFFF', borderRadius: 18, border: `1px solid ${LINE}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }

export default function Launcher({ mode }: { mode: Mode }) {
  usePageMeta('Boloka — Demo')
  return (
    <div style={{ minHeight: '100vh', background: PANEL, fontFamily: FONT, color: INK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Boloka</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: PANEL, borderRadius: 999, padding: '4px 10px' }}>
          {mode === 'testnet' ? 'Live on Stellar testnet' : 'Simulated demo'}
        </span>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 60px', display: 'flex', flexDirection: 'column', gap: 28, flex: 1, justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.4, lineHeight: 1.2 }}>
            Dollar savings for families in Botswana receiving money from abroad
          </h1>
          <div style={{ fontSize: 16, color: MUTED }}>Three apps. Open them in order.</div>
        </div>

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
              <a
                href={a.href}
                target={`boloka-${a.n}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, background: a.bg, color: '#FFFFFF', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
              >
                Open {a.name}
              </a>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
          <a href="/how-it-works" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none', border: `1.5px solid ${LINE}`, borderRadius: 999, padding: '8px 14px', background: '#FFFFFF' }}>
            How it works →
          </a>
          <a href="/admin" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none', border: `1.5px solid ${LINE}`, borderRadius: 999, padding: '8px 14px', background: '#FFFFFF' }}>
            Pool admin →
          </a>
        </div>
      </div>
    </div>
  )
}
