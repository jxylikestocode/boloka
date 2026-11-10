// Starting the server-side money flows (server/flows.ts) and following them.
import { commitment, monthOf, randomBytes32, toHex } from './proof.ts'
import * as store from './store.ts'
import { failProgress } from './progress.ts'

export type FlowStep = {
  key: string
  title: string
  kind: 'real' | 'offchain' | 'read' | 'simulated' | 'failed'
  tx?: string
  note?: string
}

/** Starts a flow on the server; returns its id as soon as it is accepted. */
export async function startFlow(path: '/api/flow/deposit' | '/api/flow/payout', body: Record<string, string>): Promise<string> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`flow failed to start: ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/** Follows a started flow, reporting each step as it lands. */
export async function followFlow(id: string, onStep?: (s: FlowStep) => void): Promise<FlowStep[]> {
  let seen = 0
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000))
    const r = await fetch(`/api/flow/${id}`)
    if (!r.ok) continue
    const job = (await r.json()) as { status: string; steps: FlowStep[]; error?: string }
    for (; seen < job.steps.length; seen++) onStep?.(job.steps[seen])
    if (job.status === 'done') return job.steps
    if (job.status === 'error') throw new Error(job.error ?? 'flow failed')
  }
}

/** Starts a flow and waits for it, reporting each step as it lands. */
export async function runFlow(
  path: '/api/flow/deposit' | '/api/flow/payout',
  body: Record<string, string>,
  onStep?: (s: FlowStep) => void,
): Promise<FlowStep[]> {
  return followFlow(await startFlow(path, body), onStep)
}

/**
 * Money for the parents: the secret and commitment are made HERE and the
 * secret never leaves this device (saved first, so it is never lost). The
 * server-side flow then runs the anchor's SEP-24 deposit into the sender's
 * settlement account and deposits that USDC into the pool under this
 * commitment, then mirrors it into Blend. Resolves once the server has
 * accepted the transfer; settlement continues and is reported via onStep.
 */
export async function depositForReceiver(
  units: bigint,
  from: { sender: string; via: string },
  onStep?: (s: FlowStep) => void,
): Promise<store.DepositRecord> {
  const month = monthOf()
  const secret = randomBytes32()
  const leaf = await commitment(secret, units, month)
  const rec: store.DepositRecord = {
    id: toHex(leaf),
    secret: toHex(secret),
    amount: units.toString(),
    month,
    commitment: toHex(leaf),
    sender: from.sender,
    via: from.via,
    date: new Date().toISOString(),
  }
  store.addDeposit(rec)
  const id = await startFlow('/api/flow/deposit', { commitment: toHex(leaf), units: units.toString() })
  followFlow(id, onStep).catch((e) => {
    console.error('deposit flow', e)
    store.markDepositFailed(rec.id)
    failProgress(e instanceof Error ? e.message : String(e))
  })
  return rec
}
