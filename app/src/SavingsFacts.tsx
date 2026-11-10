// The "check it yourself" facts for the under-the-hood strip on Boloka: the
// balance as USDC in the pool contract, the Blend interest position and rate,
// and the exchange rate and scale used to show pula. Each links to the chain
// explorer. Rendered only inside the strip, never in the app's own screens.
import { BLEND_POOL, POOL_ID, TOKEN_ID } from './config.ts'
import { EXPLORER } from './explorer.ts'
import { CHAIN_SCALE, PULA_PER_USD, pulaToUnits } from './money.ts'
import { useSavings } from './savings.tsx'
import { useYield } from './yield.ts'

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`
const usdc = (units: bigint | string, dp = 4) =>
  (Number(units) / 1e7).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

function Ref({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: '#8EE0B4', textDecoration: 'none', whiteSpace: 'nowrap' }}>
      {children} ↗
    </a>
  )
}

export default function SavingsFacts() {
  const s = useSavings()
  const y = useYield()
  const units = pulaToUnits(s.balance)
  const row = { display: 'grid', gridTemplateColumns: '58px 1fr', gap: 8, lineHeight: 1.45 } as const
  const k = { opacity: 0.6 } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6, borderBottom: '1px dashed rgba(120, 220, 170, 0.35)' }}>
      <div style={row}>
        <span style={k}>balance</span>
        <span>
          {usdc(units)} USDC held by the savings pool contract{' '}
          <Ref href={`${EXPLORER}/contracts/${POOL_ID}`}>{short(POOL_ID)}</Ref>
        </span>
      </div>
      <div style={row}>
        <span style={k}>shown as</span>
        <span>
          P {Math.round(s.balance).toLocaleString('en-US')} = USDC × {PULA_PER_USD} (1 USD = P {PULA_PER_USD}) × {CHAIN_SCALE.toLocaleString('en-US')} display scale
        </span>
      </div>
      <div style={row}>
        <span style={k}>interest</span>
        <span>
          {y ? (
            <>
              pool earns in Blend: {usdc(y.valueUnits)} USDC supplied
              {y.apr !== null ? `, ${(y.apr * 100).toFixed(2)}% a year` : ', rate still being measured'}
              {Number(y.earnedUnits) > 0 && `, earned ${usdc(y.earnedUnits, 7)} USDC so far`}{' '}
              <Ref href={`${EXPLORER}/accounts/${y.account}`}>position</Ref>{' '}
              <Ref href={`${EXPLORER}/contracts/${BLEND_POOL}`}>Blend pool</Ref>
            </>
          ) : (
            'reading the Blend position…'
          )}
        </span>
      </div>
      <div style={row}>
        <span style={k}>check</span>
        <span>
          USDC token <Ref href={`${EXPLORER}/contracts/${TOKEN_ID}`}>{short(TOKEN_ID)}</Ref> · all transactions on{' '}
          <a href="/admin" style={{ color: '#8EE0B4', textDecoration: 'none' }}>/admin</a>
        </span>
      </div>
    </div>
  )
}
