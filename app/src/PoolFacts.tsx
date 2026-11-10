// Pool admin: how the numbers behind the parents' screens work, with links to
// check each on the chain explorer: the pool's USDC, the exchange rate and
// display scale, the Blend position (rate and earnings), the token contract.
import { BLEND_POOL, POOL_ID, TOKEN_ID } from './config.ts'
import { EXPLORER } from './explorer.ts'
import { CHAIN_SCALE, PULA_PER_USD } from './money.ts'
import { GREEN, LINE, MUTED } from './ui.tsx'
import { useYield } from './yield.ts'

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`
const usdc = (units: string, dp = 4) =>
  (Number(units) / 1e7).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

function Ref({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
      {children} ↗
    </a>
  )
}

function Row({ k, children, last }: { k: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, padding: '12px 0', borderBottom: last ? undefined : `1px solid ${LINE}`, fontSize: 14, lineHeight: 1.55 }}>
      <span style={{ color: MUTED }}>{k}</span>
      <span>{children}</span>
    </div>
  )
}

export default function PoolFacts() {
  const y = useYield()
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>How the numbers work</h2>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
        What parents see in pula, and what sits on the chain behind it. Every figure can be checked on the explorer.
      </div>
      <div>
        <Row k="Held as">
          USDC in the savings pool contract <Ref href={`${EXPLORER}/contracts/${POOL_ID}`}>{short(POOL_ID)}</Ref>; the token is{' '}
          <Ref href={`${EXPLORER}/contracts/${TOKEN_ID}`}>{short(TOKEN_ID)}</Ref>
        </Row>
        <Row k="Shown as">
          pula = USDC × {PULA_PER_USD} (1 USD = P {PULA_PER_USD}) × {CHAIN_SCALE.toLocaleString('en-US')} display scale
        </Row>
        <Row k={`Why ×${CHAIN_SCALE.toLocaleString('en-US')}`}>
          The test anchor caps transactions at 10 USDC, so the chain holds 1/{CHAIN_SCALE.toLocaleString('en-US')} of each amount shown. With a production anchor the scale is 1.
        </Row>
        <Row k="Interest" last>
          {y ? (
            <>
              The pool earns in Blend: {usdc(y.valueUnits)} USDC supplied
              {y.apr !== null ? `, ${(y.apr * 100).toFixed(2)}% a year (measured from Blend's own rate)` : ', rate still being measured'}
              {Number(y.earnedUnits) > 0 && `, earned ${usdc(y.earnedUnits, 7)} USDC so far`}.{' '}
              <Ref href={`${EXPLORER}/accounts/${y.account}`}>position</Ref> · <Ref href={`${EXPLORER}/contracts/${BLEND_POOL}`}>Blend pool</Ref>
            </>
          ) : (
            'Reading the Blend position…'
          )}
        </Row>
      </div>
    </div>
  )
}
