// /how-it-works: for judges, never linked from the parents' screens. Maps one
// end-to-end run on Stellar testnet (the latest `npm run demo:e2e`) step by
// step, each with its real transaction on stellar.expert, and marks what is
// read-only, off-chain or simulated.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { BORDER, FONT, GREEN, INK, LINE, MUTED, PANEL, RED, TINT, usePageMeta } from '../ui.tsx'
import { useYield } from '../yield.ts'

const EXPERT = 'https://stellar.expert/explorer/testnet'

type Step = {
  key: string
  title: string
  kind: 'real' | 'offchain' | 'read' | 'simulated'
  tx?: string
  note?: string
  data?: Record<string, unknown>
  at: string
}
type Run = {
  finishedAt: string
  seconds: number
  anchor: string
  pool: string
  asset: string
  blend: { pool: string; usdc: string }
  scale: number
  scenario: { sendCad: number; arrivesPula: number; schoolFeePula: number }
  accounts: Record<string, string>
  steps: Step[]
}

const KIND: Record<Step['kind'], { label: string; fg: string; bg: string }> = {
  real: { label: 'Real testnet transaction', fg: GREEN, bg: TINT },
  offchain: { label: 'Real, off-chain (no transaction)', fg: '#1F4E8C', bg: '#E5EEFA' },
  read: { label: 'Real, read-only (no transaction)', fg: '#1F4E8C', bg: '#E5EEFA' },
  simulated: { label: 'Simulated', fg: RED, bg: '#FBE9E7' },
}

/** The 7 stages judges asked for; the Blend withdraw belongs to "pool withdraw". */
const STAGES = [
  ['sep10', 'SEP-10 auth'],
  ['sep24-deposit', 'SEP-24 deposit'],
  ['pool-deposit', 'Pool deposit'],
  ['blend-supply', 'Blend supply'],
  ['yield-read', 'Yield read'],
  ['pool-withdraw', 'Pool withdraw'],
  ['sep24-withdraw', 'SEP-24 withdrawal'],
] as const

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`
const card: CSSProperties = { background: '#FFFFFF', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
      {children}
    </a>
  )
}

type Mode = 'testnet' | 'demo'

/** The demo, as a visitor follows it across the three apps. */
const STORY: [string, ReactNode][] = [
  ['MoneyGram', <>Type <b>10,000</b> CAD. Orange Money and cash pickup grey out (over the P 9,500 per-transfer cap); Boloka stays available. Tap <b>Continue</b>.</>],
  ['Boloka', <>A notification drops in: <b>Money from Lerato arrived · P 99,300</b>. Tap it.</>],
  ['Boloka', <>Tap <b>Withdraw</b> → <b>Pay to bank / school</b> → P 24,000 → <b>Pay</b>.</>],
  ['Kalahari Bank', <>The balance counts up and the credit appears at the top, marked <b>NEW</b>.</>],
  ['Boloka → Lender', <>Open <a href="/prove" style={{ color: GREEN }}>Show a lender</a>, copy the code, paste it in the <a href="/lender" style={{ color: GREEN }}>lender portal</a> and tap Verify → <b>APPROVED</b>.</>],
]

export default function HowItWorks({ mode = 'testnet' }: { mode?: Mode }) {
  usePageMeta('Boloka — How it works')
  const [run, setRun] = useState<Run | null>(null)
  const [missing, setMissing] = useState(false)
  const live = useYield()

  useEffect(() => {
    // The dev server serves the latest run; a static deploy ships a copy.
    fetch('/api/runs/latest')
      .then((r) =>
        r.ok && (r.headers.get('content-type') ?? '').includes('json')
          ? r.json()
          : fetch('/runs/latest.json').then((f) => (f.ok ? f.json() : Promise.reject(f.status))),
      )
      .then(setRun)
      .catch(() => setMissing(true))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: PANEL, fontFamily: FONT, color: INK }}>
      <div style={{ background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, padding: '18px 40px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Boloka · How it works</div>
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: MUTED, background: PANEL, borderRadius: 999, padding: '4px 10px' }}>For judges · Stellar testnet</span>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 60px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ ...card, gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>The problem, and the demo</h1>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
            Kate in Canada sends her parents $10,000 CAD. Transfer apps cap at P 9,500 per transfer, an ATM gives P 3,000 at a
            time (a card P 4,000), other routes hide about 5% in the exchange rate, and the pula keeps losing value. With Boloka
            the whole amount arrives, sits in US dollars earning interest, and the P 24,000 school fee goes straight to the
            school's bank — no cash trip.
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>Follow the story across the three apps</div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STORY.map(([app, text], i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: TINT, color: GREEN, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</span>
                <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 8 }}>{app}</span>
                  {text}
                </div>
              </li>
            ))}
          </ol>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
            {mode === 'testnet'
              ? 'Every step runs on Stellar testnet: a Stellar anchor settles the money in and out, and the savings pool and yield are real contracts. A transfer takes 1–3 minutes to confirm. Best on a laptop with the three apps as separate windows, or on three phones.'
              : 'This build is simulated so the flow is instant; nothing goes on chain here. The run below is the real testnet rehearsal behind it, with every transaction.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {[['/lender', 'Lender portal'], ...(mode === 'demo' ? [['/dev', 'Reset demo']] : [])].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, fontWeight: 600, color: GREEN, textDecoration: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: '6px 12px' }}>
                {label}
              </a>
            ))}
          </div>
        </div>

        <div style={{ ...card, gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>One transfer, end to end, on Stellar testnet</h2>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
            SEP-10 auth → SEP-24 deposit → pool deposit → Blend supply → yield read → pool withdraw → SEP-24 withdrawal.
            Every step below is from one real run of <code>npm run demo:e2e</code> from fresh friendbot accounts; each hash opens on stellar.expert.
          </div>
          {run && (
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              <strong>Scenario:</strong> Kate sends ${run.scenario.sendCad.toLocaleString('en-US')} CAD → P {run.scenario.arrivesPula.toLocaleString('en-US')} arrives for her parents
              (over the P 9,500 per-transfer cap) → they pay the P {run.scenario.schoolFeePula.toLocaleString('en-US')} school fee straight to the school's bank.
              <br />
              <span style={{ color: MUTED }}>
                Run finished {new Date(run.finishedAt).toLocaleString('en-GB')} in {run.seconds}s · anchor <strong>{run.anchor}</strong> ·
                pool <Link href={`${EXPERT}/contract/${run.pool}`}>{short(run.pool)}</Link>
              </span>
            </div>
          )}
          {missing && <div style={{ color: RED, fontWeight: 600 }}>No run recorded yet. Run <code>npm run demo:e2e</code> in app/.</div>}
        </div>

        {run && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {STAGES.map(([key, stage], n) => {
              const steps = run.steps.filter((s) => s.key === key || (key === 'pool-withdraw' && s.key === 'blend-withdraw'))
              return (
                <div key={key} style={{ display: 'flex', gap: 18, padding: '18px 24px', borderTop: n ? `1px solid ${LINE}` : undefined }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: TINT, color: GREEN, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{n + 1}</div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{stage}</div>
                    {steps.length === 0 && <div style={{ color: RED, fontSize: 13 }}>Not in this run.</div>}
                    {steps.map((s, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: KIND[s.kind].fg, background: KIND[s.kind].bg, borderRadius: 999, padding: '2px 8px' }}>{KIND[s.kind].label}</span>
                        </div>
                        {s.tx && <Link href={`${EXPERT}/tx/${s.tx}`}>{s.tx}</Link>}
                        {s.note && <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{s.note}</div>}
                        {s.data && (
                          <div style={{ fontSize: 12, color: MUTED, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' }}>
                            {Object.entries(s.data).map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={card}>
            <div style={{ fontWeight: 700 }}>Two USDCs on testnet (and why there's a mirror)</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              The anchor pays out <strong>Circle's testnet USDC</strong>, so the pool holds that. Blend's testnet pool only lists
              <strong> Blend's own mock USDC</strong>. So on testnet the pool doesn't lend its own funds: a separate yield account
              supplies the <em>same amount</em> of Blend's mock USDC to Blend for every deposit (and withdraws it for every payout), and the
              parents' "Growing" figure is read from that real Blend position (b-tokens × b_rate). On mainnet, with one USDC, the pool's own
              <code> supply_to_blend</code> does this directly.
            </div>
            {live && (
              <div style={{ fontSize: 12, color: MUTED, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                Live mirror position: {(Number(live.valueUnits) / 1e7).toFixed(7)} USDC · Blend supply rate:{' '}
                {live.apr === null ? 'measuring (needs 10 min of b_rate)' : `${(live.apr * 100).toFixed(2)}% a year`}
              </div>
            )}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700 }}>What is real, what isn't</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              <li>
                <strong>Display scale 1:{run?.scale ?? 1000}.</strong> Amounts on chain are 1/{run?.scale ?? 1000} of the amounts on screen, so every
                anchor leg fits the test anchor's 1–10 USDC per-transaction limits. Every leg is otherwise real.
              </li>
              <li>
                <strong>Anchor KYC.</strong> The test anchor's SEP-24 page is completed automatically with fictional test details. With a
                production anchor the customer, or the sending app's own KYC, completes it.
              </li>
              <li>
                <strong>Small payouts.</strong> A payout below the anchor's 1 USDC minimum at this scale (e.g. Orange Money's P 3,000) gets a
                real pool withdrawal but a simulated anchor leg, marked above when it happens.
              </li>
              <li>
                <strong>Swapping anchors.</strong> Only <code>VITE_ANCHOR_DOMAIN</code> in app/.env names the anchor; MoneyGram, Yellow Card or any
                SEP-24 anchor is a config change.
              </li>
            </ul>
          </div>
        </div>

        {run && (
          <div style={card}>
            <div style={{ fontWeight: 700 }}>Accounts in this run (fresh from friendbot)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
              {Object.entries(run.accounts).map(([role, a]) => (
                <div key={role}>
                  <span style={{ color: MUTED, display: 'inline-block', width: 60 }}>{role}</span> <Link href={`${EXPERT}/account/${a}`}>{short(a)}</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
