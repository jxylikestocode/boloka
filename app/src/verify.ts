import { bytes32, bytesVec, simulate, u32 } from './chain.ts'
import { commitment, decodeNoteProof, decodeProof, isNoteProof, monthOf } from './proof.ts'
import { commitmentOf, toBytes32 } from './notes.ts'
import { pulaToUnits } from './money.ts'

export type Verdict =
  /** `claim` is the proven monthly minimum in pula; `month` is YYYYMM. */
  | { ok: true; claim: number; month: number }
  | { ok: false; reason: string }

const NOT_A_CODE: Verdict = { ok: false, reason: 'This is not a proof code.' }
const STALE: Verdict = {
  ok: false,
  reason: 'This code could not be confirmed. It may be out of date: ask the applicant for a fresh one.',
}

/**
 * Checks a proof code. Original-tree codes: each deposit must open to a leaf
 * the pool's `verify` accepts, all in the stated month. Note codes: each
 * opening must hash to the note the pool holds at that index (`verify_note`),
 * and the note's own time must fall in the month. Either way the amounts
 * must reach the claim.
 */
export async function verifyProofCode(code: string): Promise<Verdict> {
  return isNoteProof(code) ? verifyNotes(code) : verifyDeposits(code)
}

async function verifyDeposits(code: string): Promise<Verdict> {
  let proof
  try {
    proof = decodeProof(code)
  } catch {
    return NOT_A_CODE
  }

  const indexes = new Set(proof.items.map((it) => it.index))
  if (proof.items.length === 0 || indexes.size !== proof.items.length) return NOT_A_CODE

  for (const it of proof.items) {
    const leaf = await commitment(it.secret, it.amount, proof.month)
    const ok = await simulate('verify', [bytes32(leaf), bytesVec(it.path), u32(it.index)])
    if (ok !== true) return STALE
  }

  return claimed(proof.items.reduce((n, it) => n + it.amount, 0n), proof.claim, proof.month)
}

async function verifyNotes(code: string): Promise<Verdict> {
  let proof
  try {
    proof = decodeNoteProof(code)
  } catch {
    return NOT_A_CODE
  }
  const indexes = new Set(proof.items.map((it) => it.index))
  if (proof.items.length === 0 || indexes.size !== proof.items.length) return NOT_A_CODE

  for (const it of proof.items) {
    const c = commitmentOf({ amount: it.amount, pk: proof.pk, blinding: it.blinding })
    const ok = await simulate('verify_note', [bytes32(toBytes32(c)), u32(it.index)])
    if (ok !== true) return STALE
    const note = (await simulate('note_at', [u32(it.index)])) as { at: bigint | number } | null
    if (!note || monthOf(new Date(Number(note.at) * 1000)) !== proof.month) {
      return { ok: false, reason: 'A deposit in this code is from a different month than claimed.' }
    }
  }

  return claimed(proof.items.reduce((n, it) => n + it.amount, 0n), proof.claim, proof.month)
}

function claimed(total: bigint, claim: number, month: number): Verdict {
  if (total < pulaToUnits(claim)) return { ok: false, reason: 'The income shown is below the amount claimed.' }
  return { ok: true, claim, month }
}
