// Shared pieces of the docs/ designs: colours, the 390px phone frame, the
// back header, buttons and the grey rows card.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export const INK = '#14201C'
export const MUTED = '#5B6B66'
export const GREEN = '#0E7C5B'
export const TINT = '#E3F3EC'
export const PANEL = '#F4F6F5'
export const LINE = '#E6ECE9'
export const BORDER = '#D5DDD9'
export const RED = '#B3261E'
export const ORANGE = '#F26B1D'

export const FONT = 'Inter, system-ui, sans-serif'

/** The 390 × 844 phone screen, grown taller only if content needs it. */
export function Frame({ gap, children }: { gap: number; children: ReactNode }) {
  return (
    <div
      className="design app-frame"
      style={{
        width: 390,
        minHeight: 844,
        boxSizing: 'border-box',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(56px, calc(env(safe-area-inset-top) + 16px)) 20px max(24px, env(safe-area-inset-bottom))',
        gap,
        margin: '0 auto',
        fontFamily: FONT,
        color: INK,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Boloka's home. On its own port Boloka is at "/"; when all apps share one
 * URL the root is the launcher page and Boloka lives at /home.
 */
export const HOME = import.meta.env.VITE_APP ? '/' : '/home'

export function BackHeader({ title, to = HOME }: { title: string; to?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Link
        to={to}
        aria-label="Back"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: PANEL,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          flex: 'none',
        }}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
    </div>
  )
}

const buttonBase: CSSProperties = {
  height: 56,
  borderRadius: 14,
  font: `600 15px ${FONT}`,
  cursor: 'pointer',
}

export const button = {
  dark: { ...buttonBase, border: 'none', background: INK, color: '#FFFFFF' },
  green: { ...buttonBase, border: 'none', background: GREEN, color: '#FFFFFF' },
  outline: {
    ...buttonBase,
    border: `1.5px solid ${BORDER}`,
    background: '#FFFFFF',
    color: INK,
  },
} satisfies Record<string, CSSProperties>

/** Disabled look for any of the buttons above. */
export const disabledStyle: CSSProperties = { opacity: 0.5, cursor: 'default' }

export function Rows({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: PANEL, borderRadius: 16, padding: '4px 16px' }}>
      {children}
    </div>
  )
}

export function Row(props: {
  label: ReactNode
  value: ReactNode
  last?: boolean
  labelStyle?: CSSProperties
  valueStyle?: CSSProperties
  fontSize?: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 0',
        borderBottom: props.last ? undefined : `1px solid ${LINE}`,
        fontSize: props.fontSize ?? 14,
      }}
    >
      <span style={{ color: MUTED, ...props.labelStyle }}>{props.label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', ...props.valueStyle }}>
        {props.value}
      </span>
    </div>
  )
}

export const sectionLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

/** Pula without the "P": whole amounts as "9,930", others as "9,652.50". */
export function amt(n: number) {
  const whole = Math.abs(n - Math.round(n)) < 0.005
  return n.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

/** "Today, 09:14", "Yesterday, 18:02" or "1 Nov". */
export function when(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = (day(new Date()) - day(d)) / 86_400_000
  if (diff === 0) return `Today, ${time}`
  if (diff === 1) return `Yesterday, ${time}`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Month as YYYYMM → "Nov 2026". */
export function monthLabel(month: number) {
  return new Date(Math.floor(month / 100), (month % 100) - 1, 1).toLocaleDateString(
    'en-GB',
    { month: 'short', year: 'numeric' },
  )
}

/** A neutral bank icon (not any bank's branding). */
export function BankIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1F3A5F', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10l9-6 9 6" />
        <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
        <path d="M3 21h18" />
      </svg>
    </div>
  )
}

export function OrangeMoneyIcon() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: ORANGE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 18h4" />
      </svg>
    </div>
  )
}

/** A link styled like the designs' green inline links ("Change", "Edit"). */
export const inlineLink: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: GREEN,
  textDecoration: 'none',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
}

/**
 * Home-screen identity of each app in the demo. Adding a page to the home
 * screen picks up whichever app's details are set while it is shown, so
 * Boloka, MoneyGram and the bank install as three separate apps.
 */
const APPS = {
  '/favicon.svg': { id: 'boloka', title: 'Boloka', theme: '#FFFFFF', bar: 'default' },
  '/moneygram.svg': { id: 'moneygram', title: 'MoneyGram', theme: '#DA291C', bar: 'black-translucent' },
  '/bank.svg': { id: 'bank', title: 'Kalahari', theme: '#0B2545', bar: 'black-translucent' },
} as const

function setHead(selector: string, attr: string, value: string) {
  document.head.querySelector(selector)?.setAttribute(attr, value)
}

/**
 * Sets the tab title and icon while a page is shown, plus the app's
 * home-screen name, icon, manifest and status-bar colour. Boloka pages use
 * the default icon; MoneyGram and the bank pass their own.
 */
export function usePageMeta(title: string, icon = '/favicon.svg') {
  useEffect(() => {
    const app = APPS[icon as keyof typeof APPS] ?? APPS['/favicon.svg']
    document.title = title
    setHead("link[rel~='icon']", 'href', icon)
    setHead("link[rel='manifest']", 'href', `/${app.id}.webmanifest`)
    setHead("link[rel='apple-touch-icon']", 'href', `/icons/${app.id}-180.png`)
    setHead("meta[name='apple-mobile-web-app-title']", 'content', app.title)
    setHead("meta[name='apple-mobile-web-app-status-bar-style']", 'content', app.bar)
    setHead("meta[name='theme-color']", 'content', app.theme)
  }, [title, icon])
}
