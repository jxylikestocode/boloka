// Client-side mirror of the pool contract's tree (contracts/pool/src/lib.rs):
// a depth-20 binary tree of SHA-256(left || right), deposits as leaves in
// order, and empty slots padded with zero hashes (32 zero bytes at the leaf
// level, then SHA-256(z || z) of the level below).
import { hash } from '@stellar/stellar-sdk'

export const DEPTH = 20

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const data = concat(...parts)
  // Browsers only offer crypto.subtle on secure pages (https or localhost);
  // on a phone reaching the dev server over plain http, use the Stellar SDK's
  // SHA-256 instead. Same digest either way.
  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  }
  return new Uint8Array(hash(data as unknown as Parameters<typeof hash>[0]))
}

export const randomBytes32 = () => crypto.getRandomValues(new Uint8Array(32))

/** 16-byte big-endian two's complement, the width of the contract's i128. */
function i128be(n: bigint): Uint8Array {
  const out = new Uint8Array(16)
  let v = BigInt.asUintN(128, n)
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function u32be(n: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, n)
  return out
}

/** Month as YYYYMM, e.g. 202611. */
export function monthOf(d = new Date()): number {
  return d.getFullYear() * 100 + d.getMonth() + 1
}

/**
 * The leaf stored for a deposit: sha256(secret || amount || month), with the
 * amount as a 16-byte and the month (YYYYMM) as a 4-byte big-endian integer.
 */
export function commitment(secret: Uint8Array, amount: bigint, month: number) {
  return sha256(secret, i128be(amount), u32be(month))
}

/**
 * Sibling hashes from the leaf at `index` up to the root, leaf level first:
 * the `path` argument of the contract's `verify` and `withdraw`.
 */
export async function merklePath(
  leaves: Uint8Array[],
  index: number,
): Promise<Uint8Array[]> {
  if (index < 0 || index >= leaves.length) throw new Error('index out of range')
  let level = leaves
  let zero: Uint8Array = new Uint8Array(32)
  let idx = index
  const path: Uint8Array[] = []
  for (let d = 0; d < DEPTH; d++) {
    path.push(level[idx ^ 1] ?? zero)
    const next: Uint8Array[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(await sha256(level[i], level[i + 1] ?? zero))
    }
    level = next
    zero = await sha256(zero, zero)
    idx >>= 1
  }
  return path
}

// Hex and base64url helpers.

export const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export function fromHex(h: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(h)) throw new Error('bad hex')
  return Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16))
}

const toB64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromB64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  )

/**
 * What a proof code carries: for each deposit used, the opening of its leaf
 * (secret, amount) plus its position and path in the tree.
 */
export type Proof = {
  /** Claimed minimum for the month, in pula. */
  claim: number
  month: number
  items: { secret: Uint8Array; amount: bigint; index: number; path: Uint8Array[] }[]
}

/**
 * A proof code over notes in the note tree: the owner's public key once, and
 * for each note its opening (amount, blinding) and leaf index. The lender
 * recomputes each commitment and asks the pool whether that is the note at
 * that index, and reads the note's time for the month (verify.ts).
 */
export type NoteProof = {
  claim: number
  month: number
  pk: bigint
  items: { amount: bigint; blinding: bigint; index: number }[]
}

const PREFIX2 = 'SAV2.'
const HEX64 = /^[0-9a-f]{64}$/

export const isNoteProof = (code: string) => code.startsWith(PREFIX2)

export function encodeNoteProof(p: NoteProof): string {
  const hex = (n: bigint) => n.toString(16).padStart(64, '0')
  const json = JSON.stringify({
    c: p.claim,
    m: p.month,
    k: hex(p.pk),
    d: p.items.map((it) => ({ a: it.amount.toString(), b: hex(it.blinding), i: it.index })),
  })
  return PREFIX2 + toB64(new TextEncoder().encode(json))
}

/** Throws if `code` is not a well-formed note proof code. */
export function decodeNoteProof(code: string): NoteProof {
  if (!code.startsWith(PREFIX2)) throw new Error('bad prefix')
  const o = JSON.parse(new TextDecoder().decode(fromB64(code.slice(PREFIX2.length))))
  if (typeof o.c !== 'number' || !Number.isInteger(o.m) || typeof o.k !== 'string' || !HEX64.test(o.k) || !Array.isArray(o.d)) {
    throw new Error('bad fields')
  }
  return {
    claim: o.c,
    month: o.m,
    pk: BigInt('0x' + o.k),
    items: o.d.map((d: { a: string; b: string; i: number }) => {
      if (!/^\d+$/.test(d.a) || typeof d.b !== 'string' || !HEX64.test(d.b) || !Number.isInteger(d.i) || d.i < 0) throw new Error('bad item')
      return { amount: BigInt(d.a), blinding: BigInt('0x' + d.b), index: d.i }
    }),
  }
}

const PREFIX = 'SAV1.'

export function encodeProof(p: Proof): string {
  const json = JSON.stringify({
    c: p.claim,
    m: p.month,
    d: p.items.map((it) => ({
      s: toB64(it.secret),
      a: it.amount.toString(),
      i: it.index,
      p: toB64(concat(...it.path)),
    })),
  })
  return PREFIX + toB64(new TextEncoder().encode(json))
}

/** Throws if `code` is not a well-formed proof code. */
export function decodeProof(code: string): Proof {
  if (!code.startsWith(PREFIX)) throw new Error('bad prefix')
  const o = JSON.parse(new TextDecoder().decode(fromB64(code.slice(PREFIX.length))))
  if (typeof o.c !== 'number' || !Number.isInteger(o.m) || !Array.isArray(o.d)) {
    throw new Error('bad fields')
  }
  return {
    claim: o.c,
    month: o.m,
    items: o.d.map((d: { s: string; a: string; i: number; p: string }) => {
      const secret = fromB64(d.s)
      const flat = fromB64(d.p)
      if (secret.length !== 32 || flat.length !== 32 * DEPTH) throw new Error('bad item')
      if (!Number.isInteger(d.i) || d.i < 0 || !/^\d+$/.test(d.a)) {
        throw new Error('bad item')
      }
      return {
        secret,
        amount: BigInt(d.a),
        index: d.i,
        path: Array.from({ length: DEPTH }, (_, k) => flat.slice(32 * k, 32 * k + 32)),
      }
    }),
  }
}
