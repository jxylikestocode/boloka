// The root of the single-URL build: two phones at a time, the same size.
// Mom's Boloka stays on the right; the phone beside it follows the money:
// MoneyGram while Kate sends, Neo when Mom opens Private transfer or a transfer
// runs, the bank when she withdraws. It switches by itself from what the
// phones are doing (Mom's screen, the flow in progress) and can be picked by
// hand. Until the first transfer, MoneyGram's Continue button pulses: that is
// where the story starts. The under-the-hood status is a small pill in the
// corner (FlowProgress.tsx). Narrow screens get the apps as cards to open.
// Not a parents' screen.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { readProgress } from '../progress.ts'
import { FONT, GREEN, INK, LINE, MUTED, PANEL, usePageMeta } from '../ui.tsx'

type Mode = 'testnet' | 'demo'

/** `person` is the emoji that says whose phone this is; `owner` their name. */
type App = { name: string; owner: string; person: string; who: string; href: string; icon: string; bg: string }
const APPS: App[] = [
  { name: 'MoneyGram', owner: 'Kate', person: '👩🏿', who: 'in Canada', href: '/moneygram', icon: '/icons/moneygram-180.png', bg: '#DA291C' },
  { name: 'Boloka', owner: 'Mom', person: '👩🏿‍🦳', who: 'in Botswana', href: '/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { name: 'Boloka', owner: 'Neo', person: '👩🏿‍🎓', who: "Kate's sister, in Botswana", href: '/as/neo/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { name: 'Kalahari Bank', owner: 'Mom', person: '👩🏿‍🦳', who: 'her bank account, where the school fee lands', href: '/bank', icon: '/icons/bank-180.png', bg: '#0B2545' },
]
const MOM = '/home'
const byHref = (href: string) => APPS.find((a) => a.href === href)!

const PARTNERS = ['/moneygram', '/as/neo/home', '/bank']
const NEO = '/as/neo/home'
const BANK = '/bank'
const MONEYGRAM = '/moneygram'

const PHONE_W = 390
const PHONE_H = 760
const GAP = 28
/** Room above the phones (header, strip) and below (caption, links). */
const CHROME_H = 290
/** Smaller than this and a phone is hard to read: show the apps as cards instead. */
const MIN_SCALE = 0.6

/** One scale for both phones: full size when the window allows, smaller to fit; null when it cannot. */
function scaleFor(width: number, height: number): number | null {
  const byWidth = (width - 48 - GAP) / (2 * (PHONE_W + 16))
  const byHeight = (height - CHROME_H) / (PHONE_H + 16)
  const scale = Math.min(1, byWidth, byHeight)
  return scale >= MIN_SCALE ? scale : null
}

const card: CSSProperties = { background: '#FFFFFF', borderRadius: 18, border: `1px solid ${LINE}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }

function useScale() {
  const [scale, setScale] = useState(() => (typeof window !== 'undefined' ? scaleFor(window.innerWidth, window.innerHeight) : null))
  useEffect(() => {
    const on = () => setScale(scaleFor(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return scale
}

/** A phone-shaped frame running one of the apps. */
function Phone({ app, scale = 1, hidden = false }: { app: App; scale?: number; hidden?: boolean }) {
  const w = (PHONE_W + 16) * scale
  const h = (PHONE_H + 16) * scale
  return (
    <div
      data-app={app.href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        width: w,
        opacity: hidden ? 0 : 1,
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'opacity 360ms ease',
      }}
    >
      <div style={{ width: w, height: h }}>
        <div style={{ width: PHONE_W + 16, height: PHONE_H + 16, padding: 8, borderRadius: 40, background: '#0F1412', boxShadow: app.href === MOM ? '0 24px 60px rgba(14,124,91,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)' : '0 12px 30px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <iframe
            title={`${app.name} · ${app.owner}, ${app.who}`}
            src={`${app.href}?embed=1`}
            style={{ width: PHONE_W, height: PHONE_H, border: 'none', borderRadius: 32, background: '#FFFFFF', display: 'block' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: MUTED }}>
        <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">{app.person}</span>
        <span style={{ fontWeight: 700, color: INK, fontSize: 15 }}>{app.owner}</span>
        <span>· {app.who} ·</span>
        <img src={app.icon} alt="" width={18} height={18} style={{ borderRadius: 5 }} />
        <span>{app.name}</span>
      </div>
    </div>
  )
}

/**
 * Which phone belongs beside Mom's right now, from what the phones are doing:
 * Mom's screen (Private transfer → Neo, Withdraw to cash → the bank) and the flow in
 * progress (Kate's transfer → MoneyGram, a send → Neo, a payout → the bank).
 * Each new signal switches once; a hand-picked phone stays until the next.
 * Also tells whether any flow has started since the page loaded.
 */
function useFollow() {
  const [partner, setPartner] = useState(MONEYGRAM)
  const [anyFlow, setAnyFlow] = useState(false)
  const loadedAt = useRef(Date.now())
  const lastSignal = useRef('')
  useEffect(() => {
    const tick = () => {
      let signal = ''
      let want = ''
      const mom = document.querySelector<HTMLIFrameElement>(`[data-app="${MOM}"] iframe`)
      let path = ''
      try {
        path = mom?.contentWindow?.location.pathname ?? ''
      } catch {
        // not ours to read
      }
      const p = readProgress()
      const fresh = p && p.id >= loadedAt.current ? p : null
      if (fresh) setAnyFlow(true)
      if (path === '/send-boloka') {
        signal = 'mom:send'
        want = NEO
      } else if (path === '/orange') {
        signal = 'mom:withdraw'
        want = BANK
      } else if (fresh) {
        signal = `flow:${fresh.id}`
        want = fresh.title.startsWith('payout') ? BANK : fresh.title.startsWith('sending') ? (fresh.app?.startsWith('/as/neo') ? MOM : NEO) : MONEYGRAM
      }
      if (signal && signal !== lastSignal.current) {
        lastSignal.current = signal
        if (want !== MOM) setPartner(want)
      }
    }
    tick()
    const t = setInterval(tick, 500)
    window.addEventListener('storage', tick)
    return () => {
      clearInterval(t)
      window.removeEventListener('storage', tick)
    }
  }, [])
  return { partner, pick: setPartner, anyFlow }
}

/**
 * Pulses the button to tap next, inside the phone it is on (the phones are
 * this same site, so their documents can be reached). Re-applied every half
 * second: the apps re-render their buttons.
 */
function useNudge(target: { app: string; button: RegExp } | null) {
  useEffect(() => {
    const clear = () => {
      for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe')) {
        f.contentDocument?.querySelectorAll('.demo-nudge').forEach((el) => el.classList.remove('demo-nudge'))
      }
    }
    if (!target) {
      clear()
      return
    }
    const apply = () => {
      clear()
      const frame = document.querySelector<HTMLIFrameElement>(`[data-app="${target.app}"] iframe`)
      const doc = frame?.contentDocument
      if (!doc) return
      const button = [...doc.querySelectorAll<HTMLElement>('button')].find((b) => target.button.test(b.textContent?.trim() ?? ''))
      button?.classList.add('demo-nudge')
    }
    apply()
    const t = setInterval(apply, 500)
    return () => {
      clearInterval(t)
      clear()
    }
  }, [target])
}

export default function Launcher({ mode, strip, floating }: { mode: Mode; strip?: ReactNode; floating?: ReactNode }) {
  usePageMeta('Boloka — Demo')
  const scale = useScale()
  const wide = scale !== null
  const { partner, pick, anyFlow } = useFollow()
  // Until something has happened: point at where the story starts.
  useNudge(wide && !anyFlow && partner === MONEYGRAM ? { app: MONEYGRAM, button: /^continue$/i } : null)

  const links = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', fontSize: 13, color: MUTED, alignItems: 'center' }}>
      <span>Open on its own:</span>
      {APPS.map((a) => (
        <a key={a.href} href={a.href} target={`boloka-${a.href}`} style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>
          {a.person} {`${a.owner} · ${a.name}`} ↗
        </a>
      ))}
      <span style={{ width: 1, height: 14, background: LINE }} />
      <a href="/wallet" target="boloka-wallet" title="Give to a Boloka ID from an ordinary Stellar wallet, anonymously" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>
        🤫 Thabo · send from a wallet ↗
      </a>
      <span style={{ width: 1, height: 14, background: LINE }} />
      <a href="/how-it-works" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>How it works →</a>
      <a href="/admin" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>Pool admin →</a>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: PANEL, fontFamily: FONT, color: INK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Boloka</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: PANEL, borderRadius: 999, padding: '4px 10px' }}>
          {mode === 'testnet' ? 'Live on Stellar testnet' : 'Simulated demo'}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 14, color: MUTED }}>Dollar savings for families in Botswana receiving money from abroad</span>
      </div>

      <div style={{ maxWidth: wide ? 2 * (PHONE_W + 16) * scale + GAP + 288 : 980, margin: '0 auto', padding: wide ? '22px 24px 40px' : '48px 20px 60px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1, width: '100%', boxSizing: 'border-box', justifyContent: wide ? 'flex-start' : 'center' }}>
        {wide ? (
          <>
            {/* Which phone is beside Mom's: follows the money, or pick one. */}
            <div role="tablist" aria-label="The phone beside Mom's" style={{ display: 'flex', gap: 6, background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 999, padding: 4, alignSelf: 'center' }}>
              {PARTNERS.map((href) => {
                const a = byHref(href)
                const on = href === partner
                return (
                  <button
                    key={href}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => pick(href)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px 0 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 600, background: on ? GREEN : 'transparent', color: on ? '#FFFFFF' : MUTED, transition: 'background 200ms ease, color 200ms ease' }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">{a.person}</span>
                    {`${a.owner} · ${a.name}`}
                  </button>
                )
              })}
            </div>

            {/* The stage: the phone the money involves right now and Mom's, the same size. All partners stay loaded, so they keep up. */}
            <div style={{ display: 'flex', gap: GAP, justifyContent: 'center', alignItems: 'flex-start' }}>
              <div style={{ position: 'relative', width: (PHONE_W + 16) * scale, height: (PHONE_H + 16) * scale + 36 }}>
                {PARTNERS.map((href) => {
                  const active = href === partner
                  // Hidden partners must not sit over the visible one: no pointer events, underneath.
                  return (
                    <div key={href} style={{ position: 'absolute', inset: 0, pointerEvents: active ? 'auto' : 'none', zIndex: active ? 1 : 0 }}>
                      <Phone app={byHref(href)} scale={scale} hidden={!active} />
                    </div>
                  )
                })}
              </div>
              <Phone app={byHref(MOM)} scale={scale} />
            </div>
            {links}
            {strip}
            {floating}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
              <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.4, lineHeight: 1.2 }}>Four apps. Open them in order.</h1>
              <div style={{ fontSize: 15, color: MUTED }}>Kate sends in MoneyGram, Mom receives in Boloka and sends Neo some, the school fee lands in the bank.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {APPS.map((a, i) => (
                <div key={a.href} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">{a.person}</span>
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>App {i + 1} · {a.name}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{a.owner}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, flex: 1 }}>{a.owner}, {a.who}</div>
                  <a href={a.href} target={`boloka-${a.href}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, background: a.bg, color: '#FFFFFF', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
                    Open {a.name}
                  </a>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: MUTED }}>On a wider screen the phones appear side by side, with the story step by step.</div>
            {links}
            {floating}
          </>
        )}
      </div>
    </div>
  )
}
