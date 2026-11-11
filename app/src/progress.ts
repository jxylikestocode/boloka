// Progress of the transfer or payout running right now, published to
// localStorage for the demo's under-the-hood strip (same browser, any tab or
// frame). Never shown inside the apps' own screens.
import type { FlowStep } from './deposit.ts'

export type FlowDef = { key: string; label: string }[]
/** A flow step as the card knows it: the server's step plus when this browser saw it land. */
export type TimedStep = FlowStep & { doneAt?: number }
/** `id` doubles as the start time (ms); `at` is the last update, for staleness; `app` is the acting phone's path. */
export type Progress = { id: number; at: number; title: string; flow: FlowDef; steps: TimedStep[]; failed?: string; app?: string }

const KEY = 'ui.flowProgress'

/**
 * MoneyGram → Boloka. The parents are paid from a pre-funded settlement float
 * first (that is what the app shows); the anchor settles the money in behind it.
 */
export const DEPOSIT_FLOW: FlowDef = [
  { key: 'pool-deposit', label: 'Paid into Boloka from the settlement float · the app shows arrival here' },
  { key: 'blend-supply', label: 'Put to work earning interest' },
  { key: 'sep10', label: 'Settlement behind the scenes: signed in with the anchor (SEP-10)' },
  { key: 'sep24-deposit', label: 'Settlement behind the scenes: anchor refills the float in USDC (SEP-24)' },
]

/** Boloka → bank / Orange Money: a zero-knowledge spend of the parents' notes, then the fiat leg. */
export const PAYOUT_FLOW: FlowDef = [
  { key: 'zk-proof', label: 'Zero-knowledge proof made on the phone (which notes, whose: not revealed)' },
  { key: 'pool-withdraw', label: 'Paid out of the savings pool · the app shows success here' },
  { key: 'blend-withdraw', label: 'Settlement behind the scenes: taken back from Blend (yield)' },
  { key: 'sep24-withdraw', label: 'Settlement behind the scenes: anchor pays out in local money (SEP-24)' },
]

/** Boloka → another Boloka: the dollars never leave the pool. */
export const TRANSFER_FLOW: FlowDef = [
  { key: 'zk-proof', label: 'Zero-knowledge proof made on the phone (which notes, whose, how much: not revealed)' },
  { key: 'pool-transfer', label: 'Notes swapped inside the pool: two nullifiers in, two new notes out · the other phone shows arrival here' },
]

/** An outside wallet → a Boloka account, anonymously (the /wallet page, src/give.ts). */
export const GIVE_FLOW: FlowDef = [
  { key: 'deposit', label: 'His wallet funds a private pocket in the pool (the one thing his wallet signs)' },
  { key: 'proof', label: 'Zero-knowledge proof made on his device (which pocket, how much, for whom: not revealed)' },
  { key: 'relay', label: 'Transfer submitted by Boloka’s relayer from its own account · her phone shows arrival here' },
]

export function startProgress(title: string, flow: FlowDef, steps: FlowStep[] = [], app?: string) {
  localStorage.setItem(KEY, JSON.stringify({ id: Date.now(), at: Date.now(), title, flow, steps, app } satisfies Progress))
}

/**
 * Appends a step, stamped with the time it landed (one per key: the server
 * may repeat a step the browser already added; the first landing time stays).
 */
export function addProgress(step: FlowStep) {
  const cur = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
  if (!cur) return
  const steps = cur.steps.some((s) => s.key === step.key)
    ? cur.steps.map((s) => (s.key === step.key ? { ...s, ...step, doneAt: s.doneAt } : s))
    : [...cur.steps, { ...step, doneAt: Date.now() }]
  localStorage.setItem(KEY, JSON.stringify({ ...cur, at: Date.now(), steps }))
}

/** "6.7 s", "1 m 05 s". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, ms) / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)} m ${String(Math.round(s % 60)).padStart(2, '0')} s`
}

/**
 * How long each step took: the time from the previous landing (or the start)
 * to its own, in the order they landed. Parallel steps that land together
 * show the second as ~0 s. Returns ms by step key, and the last landing time.
 */
export function stepDurations(p: Progress): { byKey: Map<string, number>; lastDone: number } {
  const done = p.steps.filter((s) => s.doneAt).sort((a, b) => a.doneAt! - b.doneAt!)
  const byKey = new Map<string, number>()
  let prev = p.id
  for (const s of done) {
    byKey.set(s.key, s.doneAt! - prev)
    prev = s.doneAt!
  }
  return { byKey, lastDone: prev }
}

/**
 * Adds steps to the running flow (before `beforeKey`, else at the end): work
 * that turned out to be needed on the way, e.g. combining notes before a send.
 */
export function extendFlow(steps: FlowDef, beforeKey?: string) {
  const cur = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
  if (!cur) return
  const i = beforeKey ? cur.flow.findIndex((f) => f.key === beforeKey) : -1
  const flow = i < 0 ? [...cur.flow, ...steps] : [...cur.flow.slice(0, i), ...steps, ...cur.flow.slice(i)]
  localStorage.setItem(KEY, JSON.stringify({ ...cur, at: Date.now(), flow }))
}

export const clearProgress = () => localStorage.removeItem(KEY)

/** The flow stopped: the card shows why instead of spinning. */
export function failProgress(message: string) {
  const cur = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
  if (!cur) return
  localStorage.setItem(KEY, JSON.stringify({ ...cur, at: Date.now(), failed: message }))
}

export function readProgress(): Progress | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null
    // Stale after 10 minutes (a closed tab mid-transfer).
    return p && Date.now() - p.at < 10 * 60_000 ? p : null
  } catch {
    return null
  }
}
