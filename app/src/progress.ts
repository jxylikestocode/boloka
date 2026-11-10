// Progress of the transfer or payout running right now, published to
// localStorage for the demo's under-the-hood strip (same browser, any tab or
// frame). Never shown inside the apps' own screens.
import type { FlowStep } from './deposit.ts'

export type FlowDef = { key: string; label: string }[]
export type Progress = { at: number; title: string; flow: FlowDef; steps: FlowStep[] }

const KEY = 'ui.flowProgress'

/** MoneyGram → Boloka. */
export const DEPOSIT_FLOW: FlowDef = [
  { key: 'sep10', label: 'Signed in with the anchor (SEP-10)' },
  { key: 'sep24-deposit', label: 'Anchor settled the deposit in USDC (SEP-24)' },
  { key: 'pool-deposit', label: 'Paid into Boloka' },
  { key: 'blend-supply', label: 'Put to work earning interest' },
]

/** Boloka → bank / Orange Money. */
export const PAYOUT_FLOW: FlowDef = [
  { key: 'pool-withdraw', label: 'Paid out of the savings pool · the app shows success here' },
  { key: 'blend-withdraw', label: 'Settlement behind the scenes: taken back from Blend (yield)' },
  { key: 'sep24-withdraw', label: 'Settlement behind the scenes: anchor pays out in local money (SEP-24)' },
]

export function startProgress(title: string, flow: FlowDef, steps: FlowStep[] = []) {
  localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), title, flow, steps } satisfies Progress))
}

/** Appends a step (one per key: the server may repeat a step the browser already added). */
export function addProgress(step: FlowStep) {
  const cur = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
  if (!cur) return
  const steps = cur.steps.some((s) => s.key === step.key) ? cur.steps.map((s) => (s.key === step.key ? { ...s, ...step } : s)) : [...cur.steps, step]
  localStorage.setItem(KEY, JSON.stringify({ ...cur, at: Date.now(), steps }))
}

export const clearProgress = () => localStorage.removeItem(KEY)

export function readProgress(): Progress | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
    // Stale after 10 minutes (a closed tab mid-transfer).
    return p && Date.now() - p.at < 10 * 60_000 ? p : null
  } catch {
    return null
  }
}
