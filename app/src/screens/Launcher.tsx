// The root of the single-URL build: a guided walk through the story, two
// phones at a time, the same size. Mom's Boloka stays on the right; the phone beside it is
// whoever she is dealing with at this step (MoneyGram, Neo, the bank). A step
// strip says what to tap next, the button itself pulses, the phone to watch
// is bright and the other one dimmed, and the strip moves on by itself as the
// money lands (any step can also be clicked). The under-the-hood status is a
// small pill in the corner (FlowProgress.tsx). Narrow screens get the apps as
// cards to open. Not a parents' screen.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { readProgress } from '../progress.ts'
import { FONT, GREEN, INK, LINE, MUTED, PANEL, usePageMeta } from '../ui.tsx'

type Mode = 'testnet' | 'demo'

type App = { name: string; who: string; href: string; icon: string; bg: string }
const APPS: App[] = [
  { name: 'MoneyGram', who: 'Kate, in Canada', href: '/moneygram', icon: '/icons/moneygram-180.png', bg: '#DA291C' },
  { name: 'Boloka', who: 'Mom, in Gaborone', href: '/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { name: 'Boloka', who: "Neo, Kate's sister, in Francistown", href: '/as/neo/home', icon: '/icons/boloka-180.png', bg: GREEN },
  { name: 'Kalahari Bank', who: "The school's bank", href: '/bank', icon: '/icons/bank-180.png', bg: '#0B2545' },
]
const MOM = '/home'
const byHref = (href: string) => APPS.find((a) => a.href === href)!

/** The walk. `partner` is the phone beside Mom's; `act` the phone to tap; `flow` the progress title its action starts. */
type Step = {
  title: string
  partner: string
  act: string
  hint: string
  /** The button to pulse until the step's action has started. */
  nudge?: { app: string; button: RegExp }
  flow?: 'transfer' | 'sending' | 'payout'
  /** Once this progress step lands, the strip moves on. */
  advanceOn?: string
}
const STEPS: Step[] = [
  {
    title: 'Kate sends',
    partner: '/moneygram',
    act: '/moneygram',
    hint: 'In MoneyGram, tap Continue: Kate sends $1,000 CAD to Mom.',
    nudge: { app: '/moneygram', button: /^continue$/i },
    flow: 'transfer',
  },
  {
    title: 'Mom receives',
    partner: '/moneygram',
    act: MOM,
    hint: "Watch Mom's phone: the money arrives in a few seconds, in dollars, already earning interest.",
    flow: 'transfer',
    advanceOn: 'pool-deposit',
  },
  {
    title: 'Mom sends to Neo',
    partner: '/as/neo/home',
    act: MOM,
    hint: "On Mom's phone, tap Send to family and send Neo some. It moves inside the pool, so nobody outside can see it.",
    nudge: { app: MOM, button: /^Send to family$/ },
    flow: 'sending',
    advanceOn: 'pool-transfer',
  },
  {
    title: 'School fee to the bank',
    partner: '/bank',
    act: MOM,
    hint: "On Mom's phone, tap Withdraw and pay the school fee. It lands in the bank beside it.",
    nudge: { app: MOM, button: /^Withdraw$/ },
    flow: 'payout',
    advanceOn: 'pool-withdraw',
  },
]
const DONE_HINT = 'That is the whole story. Open Pool admin to see every transaction, or start again from MoneyGram.'

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
function Phone({ app, scale = 1, dim = false, hidden = false }: { app: App; scale?: number; dim?: boolean; hidden?: boolean }) {
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
        opacity: hidden ? 0 : dim ? 0.55 : 1,
        filter: dim && !hidden ? 'saturate(0.6)' : undefined,
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'opacity 360ms ease, filter 360ms ease',
      }}
    >
      <div style={{ width: w, height: h }}>
        <div style={{ width: PHONE_W + 16, height: PHONE_H + 16, padding: 8, borderRadius: 40, background: '#0F1412', boxShadow: app.href === MOM ? '0 24px 60px rgba(14,124,91,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)' : '0 12px 30px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <iframe
            title={`${app.name} · ${app.who}`}
            src={`${app.href}?embed=1`}
            style={{ width: PHONE_W, height: PHONE_H, border: 'none', borderRadius: 32, background: '#FFFFFF', display: 'block' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MUTED }}>
        <img src={app.icon} alt="" width={20} height={20} style={{ borderRadius: 6 }} />
        <span style={{ fontWeight: 700, color: INK }}>{app.name}</span>
        <span>· {app.who}</span>
      </div>
    </div>
  )
}

/**
 * Follows the money to move the strip on, and knows which step's action has
 * started. Reads the same saved progress the status pill does; only flows
 * started after this page loaded count, each once.
 */
function useWalk() {
  const [step, setStep] = useState(0)
  const [started, setStarted] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState(false)
  const loadedAt = useRef(Date.now())
  const handled = useRef(new Set<string>())
  useEffect(() => {
    const tick = () => {
      const p = readProgress()
      if (!p || p.id < loadedAt.current) return
      const flow = p.title.startsWith('payout') ? 'payout' : p.title.startsWith('sending') ? 'sending' : 'transfer'
      if (!handled.current.has(`${p.id}:start`)) {
        handled.current.add(`${p.id}:start`)
        setStarted((s) => new Set(s).add(flow))
        // Kate's send has begun: look at Mom's phone.
        if (flow === 'transfer') setStep((cur) => Math.max(cur, 1))
      }
      const landed = new Set(p.steps.map((s) => s.key))
      STEPS.forEach((s, i) => {
        if (s.flow !== flow || !s.advanceOn || !landed.has(s.advanceOn)) return
        const key = `${p.id}:${s.advanceOn}`
        if (handled.current.has(key)) return
        handled.current.add(key)
        if (i === STEPS.length - 1) setTimeout(() => setFinished(true), 1500)
        else setTimeout(() => setStep((cur) => Math.max(cur, i + 1)), 3500)
      })
    }
    tick()
    const t = setInterval(tick, 500)
    window.addEventListener('storage', tick)
    return () => {
      clearInterval(t)
      window.removeEventListener('storage', tick)
    }
  }, [])
  /** A clicked step starts afresh: its action is to be taken again, so its nudge comes back. */
  const choose = (i: number) => {
    setStep(i)
    if (i < STEPS.length - 1) setFinished(false)
    const again = new Set(STEPS.slice(i).map((s) => s.flow))
    setStarted((s) => new Set([...s].filter((f) => !again.has(f as Step['flow']))))
  }
  return { step, choose, started, finished }
}

/**
 * Pulses the button to tap next, inside the phone it is on (the phones are
 * this same site, so their documents can be reached). Re-applied every half
 * second: the apps re-render their buttons.
 */
function useNudge(target: Step['nudge'] | null) {
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
  const { step, choose, started, finished } = useWalk()
  const cur = STEPS[step]
  const acted = !!cur.flow && started.has(cur.flow)
  useNudge(wide && cur.nudge && !acted ? cur.nudge : null)
  // Bright: the phone to tap; once tapped, also the phone where the effect shows.
  const bright = new Set<string>([cur.act])
  if (acted || !cur.nudge) bright.add(MOM).add(cur.partner)
  const partners = [...new Set(STEPS.map((s) => s.partner))]

  const links = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', fontSize: 13, color: MUTED, alignItems: 'center' }}>
      <span>Open on its own:</span>
      {APPS.map((a) => (
        <a key={a.href} href={a.href} target={`boloka-${a.href}`} style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>
          {a.name} · {a.who.split(',')[0]} ↗
        </a>
      ))}
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
            {/* The step strip: where we are, what to tap. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <div role="tablist" aria-label="The story, step by step" style={{ display: 'flex', gap: 6, background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 999, padding: 4 }}>
                {STEPS.map((s, i) => {
                  const on = i === step
                  const done = i < step || (finished && i === step)
                  return (
                    <button
                      key={s.title}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => choose(i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px 0 6px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 600, background: on ? GREEN : 'transparent', color: on ? '#FFFFFF' : done ? GREEN : MUTED, transition: 'background 200ms ease, color 200ms ease' }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: on ? 'rgba(255,255,255,0.22)' : done ? '#E3F2E8' : PANEL, color: on ? '#FFFFFF' : done ? GREEN : MUTED }}>
                        {done && !on ? '✓' : i + 1}
                      </span>
                      {s.title}
                    </button>
                  )
                })}
              </div>
              <div key={finished ? 'done' : step} style={{ fontSize: 16, color: INK, textAlign: 'center', maxWidth: 720, lineHeight: 1.45, animation: 'arrival-in 240ms ease-out' }}>
                {finished && step === STEPS.length - 1 ? DONE_HINT : cur.hint}
              </div>
            </div>

            {/* The stage: the partner phone (whichever this step needs) and Mom's, the same size. All partners stay loaded, so they keep up. */}
            <div style={{ display: 'flex', gap: GAP, justifyContent: 'center', alignItems: 'flex-start' }}>
              <div style={{ position: 'relative', width: (PHONE_W + 16) * scale, height: (PHONE_H + 16) * scale + 36 }}>
                {partners.map((href) => {
                  const active = href === cur.partner
                  // Hidden partners must not sit over the visible one: no pointer events, underneath.
                  return (
                    <div key={href} style={{ position: 'absolute', inset: 0, pointerEvents: active ? 'auto' : 'none', zIndex: active ? 1 : 0 }}>
                      <Phone app={byHref(href)} scale={scale} hidden={!active} dim={!bright.has(href)} />
                    </div>
                  )
                })}
              </div>
              <Phone app={byHref(MOM)} scale={scale} dim={!bright.has(MOM)} />
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
                    <img src={a.icon} alt="" width={44} height={44} style={{ borderRadius: 11 }} />
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>App {i + 1}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{a.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, flex: 1 }}>{a.who}</div>
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
