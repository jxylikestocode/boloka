// Starting the server-side money flows (server/flows.ts) and following them.
import { commitmentOf, randomField, sealMemo, toBytes32, toHex, type Recipient } from './notes.ts'
import { PROFILE } from './profile.ts'
import { recipientFor } from './wallet.ts'
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

/** Which Boloka account MoneyGram pays: the main one ("Mom"). */
export const RECEIVER_PROFILE = ''

/**
 * Money for the parents, as a note in the pool's note tree: a commitment to
 * (amount, the receiver's key, a fresh blinding) and a memo with the amount
 * and blinding that only the receiver's phone can open, so it finds the note
 * by scanning the tree; nobody else can tell whose it is. The server-side
 * flow pays the pool from the settlement float under that note, mirrors it
 * into Blend and settles with the anchor behind it. Resolves once the server
 * has accepted the transfer; settlement is reported via onStep.
 */
export async function depositForReceiver(
  units: bigint,
  from: { sender: string; via: string },
  onStep?: (s: FlowStep) => void,
  to?: { name: string; recipient: Recipient; profile: string },
): Promise<store.NoteRecord> {
  const target = to ?? (await recipientFor(RECEIVER_PROFILE).then((r) => r && { ...r, profile: RECEIVER_PROFILE }))
  if (!target) throw new Error('Boloka has no account to pay yet: open Boloka once first.')
  const blinding = randomField()
  const commitment = commitmentOf({ amount: units, pk: target.recipient.pk, blinding })
  const memo = sealMemo(units, blinding, `${from.sender}|${from.via}`, target.recipient.memoPk)
  const rec: store.NoteRecord = {
    id: toHex(toBytes32(commitment)),
    amount: units.toString(),
    blinding: toHex(toBytes32(blinding)),
    from: from.sender,
    via: from.via,
    date: new Date().toISOString(),
  }
  // On the receiver's own phone (the single-URL demo shares its storage) the
  // note shows as on its way at once; elsewhere the receiver's scan finds it.
  const local = target.profile === PROFILE
  if (local) store.putNote(rec)
  const id = await startFlow('/api/flow/deposit', { commitment: rec.id, units: units.toString(), memo: toHex(memo) })
  followFlow(id, onStep).catch((e) => {
    console.error('deposit flow', e)
    if (local) store.markNoteFailed(rec.id)
    failProgress(e instanceof Error ? e.message : String(e))
  })
  return rec
}
