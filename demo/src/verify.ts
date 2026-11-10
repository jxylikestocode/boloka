// Demo build: reads the proof code and checks its claim, without the chain.
import { decodeProof } from './proof.ts'
import { pulaToUnits } from './money.ts'
import { wait } from './mock.ts'

export type Verdict =
  | { ok: true; claim: number; month: number }
  | { ok: false; reason: string }

export async function verifyProofCode(code: string): Promise<Verdict> {
  await wait(1400)
  let proof
  try {
    proof = decodeProof(code)
  } catch {
    return { ok: false, reason: 'This is not a proof code.' }
  }
  const total = proof.items.reduce((n, it) => n + it.amount, 0n)
  if (proof.items.length === 0 || total < pulaToUnits(proof.claim)) {
    return { ok: false, reason: 'The income shown is below the amount claimed.' }
  }
  return { ok: true, claim: proof.claim, month: proof.month }
}
