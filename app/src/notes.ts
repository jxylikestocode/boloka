// Notes: what the pool's note tree holds and how the apps make, find, prove
// and spend them. Mirrors contracts/pool (deposit_note / spend) and
// circuits/spend.circom; Poseidon here (poseidon-lite) is circomlib's, the
// same the contract computes through the host.
//
//   note        (amount, pk, blinding); commitment = Poseidon(amount, pk, blinding)
//   owner       whoever knows sk with pk = Poseidon(sk)
//   nullifier   Poseidon(commitment, sk), published when the note is spent
//   memo        amount ‖ blinding encrypted to the owner's memo key (X25519,
//               derived from sk), stored with the note so the owner's app
//               finds its notes by trying to open every memo
//   Boloka ID   pk ‖ memo public key: what you give someone so they can pay you
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite'
import nacl from 'tweetnacl'
import { Address, hash, xdr } from '@stellar/stellar-sdk'

/** The BN254 scalar field modulus. */
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
export const DEPTH = 20

// tweetnacl finds no random source in Node's ESM; both Node and browsers have WebCrypto.
nacl.setPRNG((x, n) => x.set(crypto.getRandomValues(new Uint8Array(n))))

// ----- bytes -----

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** 32-byte big-endian. */
export function toBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(32)
  let v = n
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

export function fromBytes(b: Uint8Array): bigint {
  let n = 0n
  for (const x of b) n = (n << 8n) | BigInt(x)
  return n
}

function u64be(n: bigint): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, n)
  return out
}

/** A random field element: 31 random bytes, always below the modulus. */
export const randomField = () => fromBytes(crypto.getRandomValues(new Uint8Array(31)))

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

// ----- keys and IDs -----

export type Keys = {
  sk: bigint
  pk: bigint
  /** X25519 pair the memos of this owner's notes are encrypted to. */
  memo: nacl.BoxKeyPair
}

/** The keys behind a spending secret. */
export function keysFrom(sk: bigint): Keys {
  const seed = new Uint8Array(hash(concat(new TextEncoder().encode('boloka-memo-key'), toBytes32(sk))))
  return { sk, pk: poseidon1([sk]), memo: nacl.box.keyPair.fromSecretKey(seed) }
}

/** Whom a note can be made out to: a public key and a memo key. */
export type Recipient = { pk: bigint; memoPk: Uint8Array }

export const recipientOf = (k: Keys): Recipient => ({ pk: k.pk, memoPk: k.memo.publicKey })

const ID_PREFIX = 'BLK'

/** A Boloka ID: "BLK" + base64url(pk ‖ memo public key), 89 characters. */
export const encodeId = (r: Recipient) => ID_PREFIX + b64url(concat(toBytes32(r.pk), r.memoPk))

export function decodeId(id: string): Recipient | null {
  const s = id.trim()
  if (!s.startsWith(ID_PREFIX)) return null
  let b: Uint8Array
  try {
    b = unB64url(s.slice(ID_PREFIX.length))
  } catch {
    return null
  }
  if (b.length !== 64) return null
  const pk = fromBytes(b.slice(0, 32))
  if (pk >= FIELD) return null
  return { pk, memoPk: b.slice(32) }
}

// ----- notes -----

export type Opening = { amount: bigint; pk: bigint; blinding: bigint }

export const commitmentOf = (o: Opening) => poseidon3([o.amount, o.pk, o.blinding])

export const nullifierOf = (commitment: bigint, sk: bigint) => poseidon2([commitment, sk])

/** Room in a memo for who sent the note and how ("Kate|MoneyGram"), UTF-8. */
const LABEL_LEN = 24
const PLAIN_LEN = 8 + 32 + LABEL_LEN
export const MEMO_LEN = 32 + nacl.box.nonceLength + PLAIN_LEN + nacl.box.overheadLength

/**
 * amount ‖ blinding ‖ label sealed to `memoPk`: ephemeral key (32) ‖ nonce
 * (24) ‖ box. Only the owner can open it; the chain learns nothing from it.
 */
export function sealMemo(amount: bigint, blinding: bigint, label: string, memoPk: Uint8Array): Uint8Array {
  const text = new Uint8Array(LABEL_LEN)
  text.set(new TextEncoder().encode(label).slice(0, LABEL_LEN))
  const eph = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const box = nacl.box(concat(u64be(amount), toBytes32(blinding), text), nonce, memoPk, eph.secretKey)
  return concat(eph.publicKey, nonce, box)
}

/** What a memo holds if it was sealed to these keys, else null. */
export function openMemo(memo: Uint8Array, keys: Keys): { amount: bigint; blinding: bigint; label: string } | null {
  if (memo.length !== MEMO_LEN) return null
  const plain = nacl.box.open(memo.slice(56), memo.slice(32, 56), memo.slice(0, 32), keys.memo.secretKey)
  if (!plain) return null
  const end = plain.indexOf(0, 40)
  return {
    amount: fromBytes(plain.slice(0, 8)),
    blinding: fromBytes(plain.slice(8, 40)),
    label: new TextDecoder().decode(plain.slice(40, end === -1 ? undefined : end)),
  }
}

// ----- the tree -----

let ZEROS: bigint[] | null = null

/** Zero hashes per level, leaf level first: 0, then Poseidon(z, z) of the level below. */
export function zeros(): bigint[] {
  if (!ZEROS) {
    ZEROS = [0n]
    for (let i = 0; i < DEPTH; i++) ZEROS.push(poseidon2([ZEROS[i], ZEROS[i]]))
  }
  return ZEROS
}

/** Sibling hashes from the leaf at `index` to the root (leaf level first), and the root. */
export function merklePath(leaves: bigint[], index: number): { path: bigint[]; root: bigint } {
  if (index < 0 || index >= leaves.length) throw new Error('index out of range')
  const z = zeros()
  let level = leaves
  let idx = index
  const path: bigint[] = []
  for (let d = 0; d < DEPTH; d++) {
    path.push(level[idx ^ 1] ?? z[d])
    const next: bigint[] = []
    for (let i = 0; i < level.length; i += 2) next.push(poseidon2([level[i], level[i + 1] ?? z[d]]))
    level = next
    idx >>= 1
  }
  return { path, root: level[0] }
}

export const rootOf = (leaves: bigint[]) => (leaves.length ? merklePath(leaves, 0).root : zeros()[DEPTH])

/**
 * How a payout address enters the proof, as the contract computes it:
 * SHA-256 of the address's ScVal XDR with the top byte cleared.
 */
export function recipientHash(address: string): bigint {
  const h = new Uint8Array(hash(new Address(address).toScVal().toXDR()))
  h[0] = 0
  return fromBytes(h)
}

// ----- the spend proof -----

/** A note being spent: its opening (the owner's pk is implied) and where it is. */
export type InputNote = { amount: bigint; blinding: bigint; index: number; path: bigint[] }

/** A zero-amount input: the circuit skips its membership check. */
export const filler = (): InputNote => ({ amount: 0n, blinding: randomField(), index: 0, path: zeros().slice(0, DEPTH) })

export type SpendPlan = {
  keys: Keys
  root: bigint
  ins: [InputNote, InputNote]
  outs: [Opening, Opening]
  /** Paid out of the pool to `recipient` (0 for a transfer inside it). */
  publicAmount: bigint
  recipient: bigint
}

export type Groth16Proof = { a: Uint8Array; b: Uint8Array; c: Uint8Array }

export type SpendProof = {
  proof: Groth16Proof
  root: bigint
  nullifiers: [bigint, bigint]
  commitments: [bigint, bigint]
  /** root, publicAmount, recipient, nullifiers, commitments: the circuit's order. */
  publicSignals: bigint[]
}

/** Where the circuit files are: URLs in the browser, paths in Node. */
export type CircuitFiles = { wasm: string; zkey: string }
export const CIRCUIT: CircuitFiles = { wasm: '/zk/spend.wasm', zkey: '/zk/spend.zkey' }

// BN254 points as the contract (and the host) expect them: G1 = x ‖ y,
// G2 = x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0, coordinates 32-byte big-endian.
export const g1 = (p: string[]) => concat(toBytes32(BigInt(p[0])), toBytes32(BigInt(p[1])))
export const g2 = (p: string[][]) =>
  concat(toBytes32(BigInt(p[0][1])), toBytes32(BigInt(p[0][0])), toBytes32(BigInt(p[1][1])), toBytes32(BigInt(p[1][0])))

// The circuit files, fetched once each and kept: handed to snarkjs as bytes,
// since given a URL it reads them in many small range requests (seconds per
// proof over the network; the production server also answers each with the
// whole file). File paths (Node) are passed through.
const fetched = new Map<string, Promise<Uint8Array>>()
const isUrl = (f: string) => /^https?:\/\//.test(f) || (typeof window !== 'undefined' && f.startsWith('/'))
function circuitFile(f: string): Promise<Uint8Array | string> {
  if (!isUrl(f)) return Promise.resolve(f)
  let p = fetched.get(f)
  if (!p) {
    p = fetch(f)
      .then((r) => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((b) => new Uint8Array(b))
    p.catch(() => fetched.delete(f))
    fetched.set(f, p)
  }
  return p
}

/** Starts downloading the circuit files so the first proof does not wait for them. */
export function warmCircuit(files: CircuitFiles = CIRCUIT) {
  void Promise.all([circuitFile(files.wasm), circuitFile(files.zkey)]).catch(() => {})
}

/** Makes the proof for `plan` (a second or two in a browser once the circuit files are loaded). */
export async function proveSpend(plan: SpendPlan, files: CircuitFiles = CIRCUIT): Promise<SpendProof> {
  const { groth16 } = await import('./snarkjs.ts')
  const [wasm, zkey] = await Promise.all([circuitFile(files.wasm), circuitFile(files.zkey)])
  const { keys, ins, outs } = plan
  const nullifiers = ins.map((i) => nullifierOf(commitmentOf({ amount: i.amount, pk: keys.pk, blinding: i.blinding }), keys.sk)) as [bigint, bigint]
  const commitments = outs.map(commitmentOf) as [bigint, bigint]
  const s = (n: bigint | number) => n.toString()
  const input = {
    root: s(plan.root),
    publicAmount: s(plan.publicAmount),
    recipient: s(plan.recipient),
    inNullifier: nullifiers.map(s),
    outCommitment: commitments.map(s),
    sk: s(keys.sk),
    inAmount: ins.map((i) => s(i.amount)),
    inBlinding: ins.map((i) => s(i.blinding)),
    inIndex: ins.map((i) => s(i.index)),
    inPathElements: ins.map((i) => i.path.map(s)),
    outAmount: outs.map((o) => s(o.amount)),
    outPk: outs.map((o) => s(o.pk)),
    outBlinding: outs.map((o) => s(o.blinding)),
  }
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey)
  return {
    proof: { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) },
    root: plan.root,
    nullifiers,
    commitments,
    publicSignals: publicSignals.map((x: string) => BigInt(x)),
  }
}

// ----- contract arguments -----

const entry = (key: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val })
const bytes = (b: Uint8Array) => xdr.ScVal.scvBytes(b)

/** The contract's Proof struct (map keys in order). */
export const proofScVal = (p: Groth16Proof) =>
  xdr.ScVal.scvMap([entry('a', bytes(p.a)), entry('b', bytes(p.b)), entry('c', bytes(p.c))])

export const fieldScVal = (n: bigint) => bytes(toBytes32(n))
export const fieldsScVal = (ns: bigint[]) => xdr.ScVal.scvVec(ns.map(fieldScVal))
export const memosScVal = (ms: Uint8Array[]) => xdr.ScVal.scvVec(ms.map(bytes))
