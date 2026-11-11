// snarkjs ships no types; this is the slice notes.ts and the scripts use.
// @ts-expect-error no declaration file
import * as snarkjs from 'snarkjs'

export type Groth16ProofJson = {
  pi_a: string[]
  pi_b: string[][]
  pi_c: string[]
  protocol: string
  curve: string
}

export const groth16 = snarkjs.groth16 as {
  fullProve(
    input: Record<string, unknown>,
    wasm: string | Uint8Array,
    zkey: string | Uint8Array,
  ): Promise<{ proof: Groth16ProofJson; publicSignals: string[] }>
  verify(vk: unknown, publicSignals: string[], proof: Groth16ProofJson): Promise<boolean>
}
