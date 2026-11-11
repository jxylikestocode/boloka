// "?" on Home: how Boloka works, in plain words. The one parents' screen that
// names the underlying pieces (USDC, the Stellar network, the pool, Blend):
// what the dollars are, why nobody can look up a balance, where the interest
// comes from, and how Boloka makes money (a share of that interest).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSavings } from '../savings.tsx'
import { useYield } from '../yield.ts'
import { useMoney } from '../currency.ts'
import { FEATURES } from '../features.ts'
import { HIDDEN_COST, PULA_PER_USD, YIELD_CUT, parentsApr } from '../money.ts'
import { GREEN, LINE, MUTED, PANEL, TINT, BackHeader, Frame, usePageMeta } from '../ui.tsx'
import PoolAnimation from '../PoolAnimation.tsx'

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: GREEN, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Point({ glyph, title, children }: { glyph: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', background: PANEL, borderRadius: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {glyph}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{children}</div>
      </div>
    </div>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const link = { color: GREEN, fontWeight: 600, textDecoration: 'none' } as const

export default function Help() {
  usePageMeta('Boloka — How it works')
  const s = useSavings()
  const { m } = useMoney()
  const apr = useYield()?.apr ?? null
  const yours = parentsApr(apr)
  // Worked example on the parents' own balance (or P 100,000 before anything has arrived).
  const base = s.balance > 0 ? s.balance : 100_000
  const poolMonth = apr === null ? null : (base * apr) / 12

  return (
    <Frame gap={22}>
      <BackHeader title="How Boloka works" />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '14px 0 2px', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Dollars that grow, that nobody can look up</div>
        <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, maxWidth: 320 }}>
          Money sent to you is kept in US dollars, earns interest, and comes out as pula whenever you need it.
        </div>
      </div>

      <PoolAnimation />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Point
          title="Your savings are real US dollars"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 6v12M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.6 6 5 0 1.4-1.3 2.5-3 2.5s-3-1.1-3-2.5" />
            </svg>
          }
        >
          They are held as <strong>USDC</strong>, a digital dollar issued by Circle and backed one-to-one by US dollars, on the
          Stellar network. A licensed money partner turns what your family sends into dollars, and turns dollars back into pula
          when you withdraw. We show them as pula at today's rate (P {PULA_PER_USD.toFixed(2)} per dollar); flip the P / $ switch
          on Home to see the dollars.
        </Point>

        <Point
          title="One shared pool, and your share is private"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          }
        >
          Everyone's dollars sit together in one savings pool. Each amount sent to you is recorded as a sealed note that only
          your phone can open, so anyone looking from outside sees the pool's total, never your balance, who sends to you, or
          how often. When you withdraw, your phone proves the note is yours without showing which one it is.
          {FEATURES.privacy && (
            <>
              {' '}
              <Link to="/private" style={link}>More about privacy →</Link>
            </>
          )}
        </Point>

        <Point
          title="Private transfer: dollars to family, inside the pool"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M4 12h12" />
              <path d="M12 8l4 4-4 4" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          }
        >
          Send to anyone with Boloka from Home: the dollars never leave the pool, so there is no fee, no limit and nothing
          to turn into pula. Your phone seals a new note that only their phone can open and proves the dollars were yours
          without pointing at any note. Outsiders see that the pool was used, not who paid whom or how much. Give family
          your Boloka ID (in Settings) so they can send to you the same way.
        </Point>
        <Point
          title="Where the interest comes from"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M4 16l6-6 4 4 6-6" />
              <path d="M14 8h6v6" />
            </svg>
          }
        >
          The pool lends its dollars on <strong>Blend</strong>, an open lending market on Stellar, where borrowers put up
          collateral and pay interest. That interest is what makes your savings grow. The rate is the market's real rate,
          not a number we set
          {apr === null ? '; it is being measured right now.' : `: ${(apr * 100).toFixed(2)}% a year at the moment.`}
        </Point>

        <Point
          title="How Boloka makes money"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M12 3v18" />
              <path d="M7 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8" />
            </svg>
          }
        >
          Boloka keeps <strong>{pct(YIELD_CUT)} of the interest</strong> the pool earns; the other {pct(1 - YIELD_CUT)} is
          yours{yours === null ? '' : ` (about ${(yours * 100).toFixed(2)}% a year)`}. That is the whole business: no fee
          to receive, no fee to withdraw, and no margin hidden in the exchange rate, where other routes take about{' '}
          {pct(HIDDEN_COST)}.
          {poolMonth !== null && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFFFFF', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#14201C' }}>On {m(base, { whole: true })} this month</div>
              <Row label="The pool earns" value={m(poolMonth)} />
              <Row label="You get" value={m(poolMonth * (1 - YIELD_CUT))} strong />
              <Row label="Boloka keeps" value={m(poolMonth * YIELD_CUT)} />
            </div>
          )}
        </Point>

        <Point
          title="Proof for a lender, without your numbers"
          glyph={
            <svg aria-hidden="true" {...icon}>
              <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          }
        >
          Need credit? <Link to="/prove" style={link}>Show a lender</Link> gives them one fact you choose, such as "receives at
          least P 5,000 a month", and nothing else: not your balance, not your history.
        </Point>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${LINE}`, fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
        Boloka never sells or shares your information.
      </div>
    </Frame>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: strong ? '#14201C' : MUTED, fontWeight: strong ? 700 : 500 }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
