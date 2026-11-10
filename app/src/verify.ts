import { bytes32, bytesVec, simulate, u32 } from './chain.ts'
import { commitment, decodeProof } from './proof.ts'
import { pulaToUnits } from './money.ts'

export type Verdict =
  /** `claim` is the proven monthly minimum in pula; `month` is YYYYMM. */
  | { ok: true; claim: number; month: number }
  | { ok: false; reason: string }

/**
 * Checks a proof code: each deposit in it must open to a leaf the pool's
 * `verify` accepts, all in the stated month, together reaching the claim.
 */
export async function verifyProofCode(code: string): Promise<Verdict> {
  let proof
  try {
    proof = decodeProof(code)
  } catch {
    return { ok: false, reason: 'This is not a proof code.' }
  }

  const indexes = new Set(proof.items.map((it) => it.index))
  if (proof.items.length === 0 || indexes.size !== proof.items.length) {
    return { ok: false, reason: 'This is not a proof code.' }
  }

  for (const it of proof.items) {
    const leaf = await commitment(it.secret, it.amount, proof.month)
    const ok = await simulate('verify', [bytes32(leaf), bytesVec(it.path), u32(it.index)])
    if (ok !== true) {
      return {
        ok: false,
        reason:
          'This code could not be confirmed. It may be out of date: ask the applicant for a fresh one.',
      }
    }
  }

  const total = proof.items.reduce((n, it) => n + it.amount, 0n)
  if (total < pulaToUnits(proof.claim)) {
    return { ok: false, reason: 'The income shown is below the amount claimed.' }
  }

  return { ok: true, claim: proof.claim, month: proof.month }
}
