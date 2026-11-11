// Giving to a Boloka account from an ordinary Stellar wallet (the /wallet
// page): the sender needs no Boloka account and is never named to the
// recipient, to Boloka, or on the chain. Two steps:
//
//   1. deposit_note from the wallet into a private pocket: a note owned by a
//      key made here for this wallet. The chain shows the wallet paying the
//      pool, nothing about whom it is for.
//   2. a zero-knowledge spend from that pocket to the recipient's note, made
//      here and submitted by Boloka's relayer (POST /api/relay) from Boloka's
//      own account, so the wallet never touches the transfer. The relayer sees
//      a proof, two nullifiers and two commitments: not the amount, not either
//      party. Only the recipient's phone can open the note (and reads the
//      label the sender chose, e.g. "A friend").
import { Keypair } from '@stellar/stellar-sdk'
import { bytes32, i128, address, invokeAs, keypairSigner, readNoteLeaves, type Signer } from './chain.ts'
import { PAYOUT_ADDRESS } from './config.ts'
import {
  commitmentOf,
  filler,
  fromBytes,
  keysFrom,
  merklePath,
  proveSpend,
  randomField,
  recipientHash,
  sealMemo,
  toBytes32,
  toHex,
  type Keys,
  type Recipient,
} from './notes.ts'
import { xdr } from '@stellar/stellar-sdk'

/** Keys for the private pocket of this wallet, kept only in this browser (never shared with the demo's other apps). */
export function pocketKeys(walletAddress: string): Keys {
  const key = `wallet.${walletAddress}.noteSecret`
  const saved = localStorage.getItem(key)
  let sk: bigint
  if (saved && /^[0-9a-f]{64}$/.test(saved)) {
    sk = fromBytes(Uint8Array.from(saved.match(/../g)!, (x) => parseInt(x, 16)))
  } else {
    sk = randomField()
    localStorage.setItem(key, toHex(toBytes32(sk)))
  }
  return keysFrom(sk)
}

/** A test wallet for visitors without Freighter: a keypair kept in this browser. */
export function testWallet(): Signer {
  const key = 'wallet.test.secret'
  const saved = localStorage.getItem(key)
  const kp = saved ? Keypair.fromSecret(saved) : Keypair.random()
  if (!saved) localStorage.setItem(key, kp.secret())
  return keypairSigner(kp)
}

export type GiveStep = {
  key: 'deposit' | 'proof' | 'relay'
  title: string
  tx?: string
  note?: string
  ms: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Gives `units` from `signer`'s wallet to `recipient`, labelled `label` for
 * them. Reports each step as it lands. Resolves with the relayed transfer's
 * transaction hash.
 */
export async function give(
  signer: Signer,
  recipient: Recipient,
  units: bigint,
  label: string,
  onStep: (s: GiveStep) => void,
): Promise<string> {
  const keys = pocketKeys(signer.address)

  // 1. The wallet funds a private pocket (the wallet signs this one).
  let t0 = Date.now()
  const pocket = { amount: units, pk: keys.pk, blinding: randomField() }
  const pocketCommitment = commitmentOf(pocket)
  const pocketMemo = sealMemo(units, pocket.blinding, 'me|Wallet', keys.memo.publicKey)
  const dep = await invokeAs(signer, 'deposit_note', [address(signer.address), bytes32(toBytes32(pocketCommitment)), i128(units), xdr.ScVal.scvBytes(pocketMemo)])
  onStep({ key: 'deposit', title: 'Your wallet funded a private pocket in the pool', tx: dep.hash, ms: Date.now() - t0, note: 'Visible on chain: your wallet paid the pool. Not visible: whom it is for.' })

  // The pocket's leaf, once the tree has it.
  let leaves: bigint[] = []
  let index = -1
  for (let i = 0; i < 30 && index < 0; i++) {
    leaves = (await readNoteLeaves()).map(fromBytes)
    index = leaves.indexOf(pocketCommitment)
    if (index < 0) await sleep(1000)
  }
  if (index < 0) throw new Error('The pocket did not appear in the pool in time. Please try again.')

  // 2. The zero-knowledge transfer to the recipient, relayed.
  t0 = Date.now()
  const gift = { amount: units, pk: recipient.pk, blinding: randomField() }
  const change = { amount: 0n, pk: keys.pk, blinding: randomField() }
  const to = PAYOUT_ADDRESS
  const proof = await proveSpend({
    keys,
    root: merklePath(leaves, index).root,
    ins: [{ amount: units, blinding: pocket.blinding, index, path: merklePath(leaves, index).path }, filler()],
    outs: [gift, change],
    publicAmount: 0n,
    recipient: recipientHash(to),
  })
  const memos = [sealMemo(units, gift.blinding, `${label}|Wallet`, recipient.memoPk), sealMemo(0n, change.blinding, 'change|Wallet', keys.memo.publicKey)]
  onStep({ key: 'proof', title: 'Zero-knowledge proof made on this device', ms: Date.now() - t0, note: 'It proves the pocket is yours and the new note is well formed, without saying which note or how much.' })

  t0 = Date.now()
  const hex = (n: bigint) => toHex(toBytes32(n))
  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proof: { a: toHex(proof.proof.a), b: toHex(proof.proof.b), c: toHex(proof.proof.c) },
      root: hex(proof.root),
      nullifiers: proof.nullifiers.map(hex),
      commitments: proof.commitments.map(hex),
      memos: memos.map(toHex),
      to,
    }),
  })
  if (!res.ok) throw new Error(`The relayer refused: ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  for (;;) {
    await sleep(1000)
    const r = await fetch(`/api/flow/${id}`)
    if (!r.ok) continue
    const job = (await r.json()) as { status: string; steps: { key: string; tx?: string }[]; error?: string }
    if (job.status === 'error') throw new Error(job.error ?? 'The relayed transfer failed.')
    const done = job.steps.find((s) => s.key === 'pool-transfer')
    if (job.status === 'done' && done) {
      onStep({ key: 'relay', title: 'Transferred to their Boloka, submitted by Boloka’s relayer', tx: done.tx, ms: Date.now() - t0, note: 'The chain and the relayer see two nullifiers and two new notes: not the amount, not you, not them.' })
      return done.tx ?? ''
    }
  }
}
