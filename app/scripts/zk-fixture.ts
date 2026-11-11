// Makes the pool contract's spend fixtures from the built circuit
// (circuits/build.sh runs this after the trusted setup): two sample proofs the
// Rust tests replay against the same two-note tree.
//   contracts/pool/src/fixtures/deposits.bin   c1 ‖ c2: the two notes to deposit (600, 400)
//   contracts/pool/src/fixtures/spend1.bin     proof (256) ‖ 7 public signals (32 each):
//                                              spends both notes → 300 to B, 650 change, 50 paid out
//   contracts/pool/src/fixtures/spend2.bin     spends note 1 with a filler → 600 to B, 0 change, nothing paid out
// Public signals: root, publicAmount, recipient, nullifier[2], commitment[2].
// Secrets are fixed so the commitments never change; the proofs are random.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  commitmentOf,
  concat,
  filler,
  keysFrom,
  merklePath,
  proveSpend,
  recipientHash,
  toBytes32,
  toHex,
  type SpendProof,
} from '../src/notes.ts'

const here = dirname(fileURLToPath(import.meta.url))
const circuits = join(here, '../../circuits/build')
const fixtures = join(here, '../../contracts/pool/src/fixtures')
const files = { wasm: join(circuits, 'spend_js/spend.wasm'), zkey: join(circuits, 'spend.zkey') }

/** Where the payout of spend1 goes (a contract address: in the test ledger a classic account would need a trustline). */
export const RECIPIENT = 'CBBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEE5XW'

const A = keysFrom(1001n)
const B = keysFrom(2002n)
const n1 = { amount: 600n, pk: A.pk, blinding: 11n }
const n2 = { amount: 400n, pk: A.pk, blinding: 22n }
const leaves = [commitmentOf(n1), commitmentOf(n2)]
const root = merklePath(leaves, 0).root
const recipient = recipientHash(RECIPIENT)

const spend1 = await proveSpend(
  {
    keys: A,
    root,
    ins: [
      { ...n1, index: 0, path: merklePath(leaves, 0).path },
      { ...n2, index: 1, path: merklePath(leaves, 1).path },
    ],
    outs: [
      { amount: 300n, pk: B.pk, blinding: 33n },
      { amount: 650n, pk: A.pk, blinding: 44n },
    ],
    publicAmount: 50n,
    recipient,
  },
  files,
)
const spend2 = await proveSpend(
  {
    keys: A,
    root,
    ins: [{ ...n1, index: 0, path: merklePath(leaves, 0).path }, filler()],
    outs: [
      { amount: 600n, pk: B.pk, blinding: 55n },
      { amount: 0n, pk: A.pk, blinding: 66n },
    ],
    publicAmount: 0n,
    recipient,
  },
  files,
)

// Off-chain check with snarkjs before trusting the files.
const { groth16 } = await import('../src/snarkjs.ts')
const vk = JSON.parse(readFileSync(join(circuits, 'verification_key.json'), 'utf8'))
for (const [name, s] of [['spend1', spend1], ['spend2', spend2]] as const) {
  const proof = {
    pi_a: [s.proof.a.slice(0, 32), s.proof.a.slice(32)].map((b) => BigInt('0x' + toHex(b)).toString()),
    pi_b: [
      [s.proof.b.slice(32, 64), s.proof.b.slice(0, 32)],
      [s.proof.b.slice(96, 128), s.proof.b.slice(64, 96)],
    ].map((pair) => pair.map((b) => BigInt('0x' + toHex(b)).toString())),
    pi_c: [s.proof.c.slice(0, 32), s.proof.c.slice(32)].map((b) => BigInt('0x' + toHex(b)).toString()),
    protocol: 'groth16',
    curve: 'bn128',
  }
  if (!(await groth16.verify(vk, s.publicSignals.map(String), proof))) throw new Error(`${name}: proof does not verify`)
}

const pack = (s: SpendProof) => concat(s.proof.a, s.proof.b, s.proof.c, ...s.publicSignals.map(toBytes32))
mkdirSync(fixtures, { recursive: true })
writeFileSync(join(fixtures, 'deposits.bin'), concat(...leaves.map(toBytes32)))
writeFileSync(join(fixtures, 'spend1.bin'), pack(spend1))
writeFileSync(join(fixtures, 'spend2.bin'), pack(spend2))
writeFileSync(
  join(fixtures, 'README.md'),
  `# Spend fixtures

Made by \`app/scripts/zk-fixture.ts\` (run by \`circuits/build.sh\`) from the built circuit; the
contract tests replay them. A tree of two notes owned by A: 600 and 400 (\`deposits.bin\`, two
commitments). \`spend1.bin\` spends both: 300 to B, 650 change to A, 50 paid out to
\`${RECIPIENT}\`. \`spend2.bin\` spends the 600 note with a filler input: 600 to B, a 0 note to A,
nothing paid out. Each file is the proof (a 64 ‖ b 128 ‖ c 64 bytes) followed by the seven public
signals as 32-byte big-endian: root, public amount, recipient hash, two nullifiers, two commitments.
\`vk.bin\` (from \`circuits/export-verifier.mjs\`) is alpha ‖ beta ‖ gamma ‖ delta ‖ ic….

Rebuild them after any change to the circuit (the key changes with it).
`,
)
console.log(`fixtures: root ${toHex(toBytes32(root))}; spend1 pays 50 to ${RECIPIENT}; spend2 transfers 600 → ${fixtures}`)
process.exit(0)
