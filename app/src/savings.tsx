import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { PAYOUT_ADDRESS } from './config.ts'
import {
  address,
  bytes32,
  bytesVec,
  i128,
  keypair,
  invokeAsync,
  readNoteLeaves,
  readNotes,
  readPool,
  readSpent,
  setupAccount,
  spendNotes,
  u32,
} from './chain.ts'
import { depositForReceiver, runFlow } from './deposit.ts'
import { addProgress, clearProgress, failProgress, PAYOUT_FLOW, startProgress, TRANSFER_FLOW } from './progress.ts'
import {
  encodeNoteProof,
  encodeProof,
  fromHex,
  merklePath as merklePathV1,
  monthOf,
  randomBytes32,
  toHex,
} from './proof.ts'
import {
  commitmentOf,
  filler,
  fromBytes,
  merklePath,
  nullifierOf,
  openMemo,
  proveSpend,
  randomField,
  recipientHash,
  sealMemo,
  toBytes32,
  type InputNote,
  type Opening,
  type Recipient,
} from './notes.ts'
import { BASENAME, ME } from './profile.ts'
import * as store from './store.ts'
import { myId, noteKeys, register } from './wallet.ts'
import { DESTINATIONS, pulaToUnits, unitsToPula, type Destination } from './money.ts'

export type Activity = {
  id: string
  kind: 'in' | 'out'
  /** Submitted, not yet confirmed by the pool. */
  pending?: boolean
  title: string
  detail: string
  pula: number
  date: string
}

export type SendReceipt = {
  dest: Destination
  pula: number
  fee: number
  arrives: number
  reference: string
  date: string
}

export type TransferReceipt = {
  to: string
  pula: number
  reference: string
  date: string
}

/** Someone with a Boloka account this account can pay. */
export type Payee = { name: string; recipient: Recipient }

type Savings = {
  status: 'loading' | 'ready' | 'error'
  balance: number
  activity: Activity[]
  /** The most that can go in one send (at most two notes are spent at once). */
  sendable: number
  /** This phone's Boloka ID, for others to pay it. */
  myId: string
  send(pula: number, dest: Destination): Promise<SendReceipt>
  transfer(pula: number, to: Payee): Promise<TransferReceipt>
  arrive(): Promise<Activity>
  proofCode(thresholdPula: number): Promise<string | null>
}

const Ctx = createContext<Savings | null>(null)

export function useSavings() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSavings outside SavingsProvider')
  return s
}

/** The deposit a MoneyGram arrival simulates on the dev page. */
const ARRIVAL = { pula: 9900, sender: 'Kate', via: 'MoneyGram' }

const hex32 = (n: bigint) => toHex(toBytes32(n))
const unhex = (h: string) => fromBytes(fromHex(h))

type Note = { rec: store.NoteRecord; index: number; nullifier: string }

type Snapshot = {
  // The original tree: deposits from before the note tree, still withdrawable.
  leaves: Uint8Array[]
  deposits: { rec: store.DepositRecord; index: number }[]
  withdrawals: store.WithdrawalRecord[]
  pendingDeposits: store.DepositRecord[]
  pendingWithdrawals: store.WithdrawalRecord[]
  // The note tree.
  noteLeaves: bigint[]
  /** This account's notes in the tree, spent or not. */
  notes: Note[]
  unspent: Note[]
  /** Spends the pool has confirmed (every nullifier used). */
  spends: store.SpendRecord[]
  /** Recent records the pool hasn't confirmed yet: shown as on their way. */
  pendingNotes: store.NoteRecord[]
  pendingSpends: store.SpendRecord[]
  /** Confirmed, less what pending spends take out. */
  balanceUnits: bigint
  /** The two largest unspent notes together: the most one spend can move. */
  sendableUnits: bigint
}

const PENDING_WINDOW = 15 * 60_000
const recent = (iso: string) => Date.now() - Date.parse(iso) < PENDING_WINDOW
const sum = (xs: { amount: string }[]) => xs.reduce((n, x) => n + BigInt(x.amount), 0n)

/**
 * Finds this account's notes in the tree: records it already has get their
 * leaf index; leaves it has not looked at yet have their memos tried with
 * this account's key (a note from another phone shows up this way).
 */
async function scan(noteLeaves: bigint[]) {
  const keys = noteKeys()
  const position = new Map(noteLeaves.map((l, i) => [hex32(l), i]))
  const known = new Set<string>()
  for (const n of store.notes()) {
    known.add(n.id)
    const index = position.get(n.id)
    if (index !== undefined && n.index !== index) store.putNote({ ...n, index })
  }
  const from = store.scanned()
  if (noteLeaves.length <= from) return
  const fresh: number[] = []
  for (let i = from; i < noteLeaves.length; i++) if (!known.has(hex32(noteLeaves[i]))) fresh.push(i)
  const entries = await readNotes(fresh)
  for (const [index, e] of entries) {
    const o = openMemo(e.memo, keys)
    if (!o) continue
    const commitment = fromBytes(e.commitment)
    if (commitmentOf({ amount: o.amount, pk: keys.pk, blinding: o.blinding }) !== commitment) continue
    const [sender = 'Someone', via = 'Boloka'] = o.label.split('|')
    store.putNote({
      id: hex32(commitment),
      amount: o.amount.toString(),
      blinding: hex32(o.blinding),
      index,
      from: sender,
      via,
      date: new Date(e.at * 1000).toISOString(),
      change: sender === 'change',
    })
  }
  store.setScanned(noteLeaves.length)
}

/** Reconciles the local records with what the pool has confirmed. */
async function snapshot(): Promise<Snapshot> {
  const keys = noteKeys()
  const allW = store.withdrawals()
  const [{ leaves, used }, noteLeavesBytes] = await Promise.all([readPool(allW.map((w) => fromHex(w.nullifier))), readNoteLeaves()])
  const noteLeaves = noteLeavesBytes.map(fromBytes)
  await scan(noteLeaves)

  // The original tree.
  const position = new Map(leaves.map((l, i) => [toHex(l), i]))
  const deposits = store
    .deposits()
    .filter((d) => position.has(d.commitment))
    .map((rec) => ({ rec, index: position.get(rec.commitment)! }))
  const withdrawals = allW.filter((w) => used.has(w.nullifier))
  const pendingDeposits = store.deposits().filter((d) => !position.has(d.commitment) && !d.failed && recent(d.date))
  const pendingWithdrawals = allW.filter((w) => !used.has(w.nullifier) && recent(w.date))

  // The note tree: which of this account's notes are in it, and which are spent.
  const inTree = store.notes().filter((n) => n.index !== undefined)
  const notes: Note[] = inTree.map((rec) => ({ rec, index: rec.index!, nullifier: hex32(nullifierOf(unhex(rec.id), keys.sk)) }))
  const allS = store.spends()
  const spentSet = await readSpent([...new Set([...notes.map((n) => n.nullifier), ...allS.flatMap((s) => s.nullifiers)])].map(fromHex))
  const unspent = notes.filter((n) => !spentSet.has(n.nullifier))
  const spends = allS.filter((s) => s.nullifiers.every((n) => spentSet.has(n)))
  const pendingNotes = store.notes().filter((n) => n.index === undefined && !n.failed && !n.change && recent(n.date))
  const pendingSpends = allS.filter((s) => !s.nullifiers.every((n) => spentSet.has(n)) && recent(s.date))

  const v1 = sum(deposits.map((d) => d.rec)) - sum(withdrawals) - sum(pendingWithdrawals)
  const balanceUnits = v1 + sum(unspent.map((n) => n.rec)) - sum(pendingSpends)
  const top = unspent.map((n) => BigInt(n.rec.amount)).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  const sendableUnits = (top[0] ?? 0n) + (top[1] ?? 0n) - sum(pendingSpends)
  return { leaves, deposits, withdrawals, pendingDeposits, pendingWithdrawals, noteLeaves, notes, unspent, spends, pendingNotes, pendingSpends, balanceUnits, sendableUnits: sendableUnits > 0n ? sendableUnits : 0n }
}

const depositActivity = (d: store.DepositRecord): Activity => ({
  id: d.id,
  kind: 'in',
  title: d.sender,
  detail: d.via,
  pula: unitsToPula(BigInt(d.amount)),
  date: d.date,
})

const noteActivity = (n: store.NoteRecord): Activity => ({
  id: n.id,
  kind: 'in',
  title: n.from,
  detail: n.via,
  pula: unitsToPula(BigInt(n.amount)),
  date: n.date,
})

const withdrawalActivity = (w: store.WithdrawalRecord): Activity => ({
  id: w.id,
  kind: 'out',
  title: DESTINATIONS[w.dest ?? 'orange'].name,
  detail: 'Sent',
  pula: unitsToPula(BigInt(w.amount)),
  date: w.date,
})

const spendActivity = (s: store.SpendRecord): Activity => ({
  id: s.id,
  kind: 'out',
  title: s.kind === 'transfer' ? (s.to ?? 'Boloka') : DESTINATIONS[s.dest ?? 'bank'].name,
  detail: s.kind === 'transfer' ? 'Boloka' : 'Sent',
  pula: unitsToPula(BigInt(s.amount)),
  date: s.date,
})

function activityOf(s: Snapshot): Activity[] {
  return [
    ...s.deposits.map((d) => depositActivity(d.rec)),
    ...s.pendingDeposits.map((d) => ({ ...depositActivity(d), pending: true })),
    ...s.notes.filter((n) => !n.rec.change).map((n) => noteActivity(n.rec)),
    ...s.pendingNotes.map((n) => ({ ...noteActivity(n), pending: true })),
    ...s.withdrawals.map(withdrawalActivity),
    ...s.pendingWithdrawals.map((w) => ({ ...withdrawalActivity(w), pending: true })),
    ...s.spends.map(spendActivity),
    ...s.pendingSpends.map((w) => ({ ...spendActivity(w), pending: true })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

/** Turns contract failures into something a person can act on. */
function friendly(e: unknown): Error {
  console.error(e)
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('Error(Contract, #4)') || m.includes('Error(Contract, #11)')) {
    return new Error('Your savings changed while sending. Please try again.')
  }
  if (m.includes('Error(Contract, #5)')) return new Error('That money was already sent.')
  if (m.startsWith('Only ') || m.startsWith('That is more')) return new Error(m)
  return new Error('That did not go through. Please try again.')
}

const reference = (prefix: string, date: string) =>
  `${prefix}${date.slice(2, 10).replace(/-/g, '')}.${Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0')}`

export function SavingsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Savings['status']>('loading')
  const [snap, setSnap] = useState<Snapshot | null>(null)

  const refresh = useCallback(async () => {
    const s = await snapshot()
    setSnap(s)
    return s
  }, [])

  useEffect(() => {
    // Reading the balance needs no account, so Home shows straight away; the
    // account is set up in the background and awaited only before sending.
    setupAccount(keypair()).catch(console.error)
    void register()
    refresh()
      .then(() => setStatus('ready'))
      .catch((e) => {
        console.error(e)
        setStatus('error')
      })
  }, [refresh])

  // MoneyGram and the other phone run as separate apps; their notes reach this
  // app through the pool (the memo scan) or the shared records ('storage'), so
  // re-read the pool every few seconds: every 2 s while something is on its
  // way, every 5 s otherwise.
  const waiting = (snap?.pendingNotes.length ?? 0) + (snap?.pendingSpends.length ?? 0) + (snap?.pendingDeposits.length ?? 0) + (snap?.pendingWithdrawals.length ?? 0) > 0
  useEffect(() => {
    let busy = false
    const tick = () => {
      if (busy || document.hidden) return
      busy = true
      refresh()
        .catch(console.error)
        .finally(() => (busy = false))
    }
    window.addEventListener('storage', tick)
    window.addEventListener('focus', tick)
    const t = setInterval(tick, waiting ? 2000 : 5000)
    return () => {
      window.removeEventListener('storage', tick)
      window.removeEventListener('focus', tick)
      clearInterval(t)
    }
  }, [refresh, waiting])

  /**
   * A spend of this account's notes: `units` to a payee inside the pool, or
   * out of the pool to the payout account. Picks the fewest notes that cover
   * it (at most two), proves, records, submits. Resolves on submission with
   * the record and the confirmation promise.
   */
  async function spend(units: bigint, out: { kind: 'payout'; dest: Destination } | { kind: 'transfer'; to: Payee }, date: string, fee: number, ref: string) {
    const kp = keypair()
    const keys = noteKeys()
    const s = await snapshot()
    if (units > s.balanceUnits) throw new Error('That is more than your savings.')
    // Largest first; one or two notes.
    const picked: Note[] = []
    let total = 0n
    for (const n of [...s.unspent].sort((a, b) => (BigInt(b.rec.amount) > BigInt(a.rec.amount) ? 1 : -1))) {
      if (total >= units || picked.length === 2) break
      picked.push(n)
      total += BigInt(n.rec.amount)
    }
    if (total < units) throw new Error(`Only P ${Math.floor(unitsToPula(s.sendableUnits)).toLocaleString('en-US')} can go in one send. Please send it in parts.`)
    const change = total - units
    const ins = picked.map((n): InputNote => ({
      amount: BigInt(n.rec.amount),
      blinding: unhex(n.rec.blinding),
      index: n.index,
      path: merklePath(s.noteLeaves, n.index).path,
    }))
    while (ins.length < 2) ins.push(filler())
    const changeNote: Opening = { amount: change, pk: keys.pk, blinding: randomField() }
    const outs: [Opening, Opening] =
      out.kind === 'transfer'
        ? [{ amount: units, pk: out.to.recipient.pk, blinding: randomField() }, changeNote]
        : [changeNote, { amount: 0n, pk: keys.pk, blinding: randomField() }]
    const memos =
      out.kind === 'transfer'
        ? [sealMemo(outs[0].amount, outs[0].blinding, `${ME.name}|Boloka`, out.to.recipient.memoPk), sealMemo(change, changeNote.blinding, 'change|Boloka', keys.memo.publicKey)]
        : [sealMemo(change, changeNote.blinding, 'change|Boloka', keys.memo.publicKey), sealMemo(0n, outs[1].blinding, 'change|Boloka', keys.memo.publicKey)]
    const to = out.kind === 'payout' ? PAYOUT_ADDRESS : kp.publicKey()

    const t0 = Date.now()
    const proof = await proveSpend({
      keys,
      root: merklePath(s.noteLeaves, picked[0].index).root,
      ins: ins as [InputNote, InputNote],
      outs,
      publicAmount: out.kind === 'payout' ? units : 0n,
      recipient: recipientHash(to),
    })
    addProgress({
      key: 'zk-proof',
      title: 'Zero-knowledge proof',
      kind: 'offchain',
      note: `Made on this phone in ${((Date.now() - t0) / 1000).toFixed(1)} s (Groth16, ${picked.length} note${picked.length === 1 ? '' : 's'} spent, verified by the pool contract).`,
    })

    // Saved before sending; they count once the pool has used the nullifiers.
    const rec: store.SpendRecord = {
      id: hex32(proof.nullifiers[0]),
      nullifiers: proof.nullifiers.map(hex32),
      amount: units.toString(),
      kind: out.kind,
      dest: out.kind === 'payout' ? out.dest : undefined,
      to: out.kind === 'transfer' ? out.to.name : undefined,
      fee,
      reference: ref,
      date,
    }
    store.putSpend(rec)
    if (change > 0n) {
      store.putNote({ id: hex32(commitmentOf(changeNote)), amount: change.toString(), blinding: hex32(changeNote.blinding), from: 'change', via: 'Boloka', date, change: true })
    }
    await setupAccount(kp)
    const res = await spendNotes(kp, {
      proof: proof.proof,
      root: proof.root,
      nullifiers: proof.nullifiers,
      commitments: proof.commitments,
      memos,
      amount: out.kind === 'payout' ? units : 0n,
      to,
    })
    store.setSpendTx(rec.id, res.hash)
    return { rec, res }
  }

  async function send(pula: number, dest: Destination): Promise<SendReceipt> {
    const units = pulaToUnits(pula)
    const date = new Date().toISOString()
    const fee = DESTINATIONS[dest].fee(pula)
    const ref = reference(dest === 'bank' ? 'EFT' : 'OM', date)
    // The demo's under-the-hood card shows the payout from the tap onwards.
    startProgress('payout in progress', PAYOUT_FLOW, [], `${BASENAME === '/' ? '' : BASENAME}/home`)
    try {
      const s = snap ?? (await snapshot())
      if (s.unspent.length === 0 && s.deposits.length > 0) {
        await sendFromOriginalTree(units, dest, fee, ref, date)
      } else {
        const { res } = await spend(units, { kind: 'payout', dest }, date, fee, ref)
        // The pool paid the payout account; the anchor's fiat leg and the
        // Blend mirror unwind behind it, followed by the card.
        res.confirmed
          .then(() => {
            addProgress({ key: 'pool-withdraw', title: 'Pool spend: paid out', kind: 'real', tx: res.hash })
            return runFlow('/api/flow/payout', { units: units.toString(), withdrawTx: res.hash }, (st) => addProgress(st))
          })
          .then(() => refresh())
          .catch((e) => {
            console.error('payout', e)
            failProgress(e instanceof Error ? e.message : String(e))
          })
      }
    } catch (e) {
      clearProgress()
      throw friendly(e)
    }
    await refresh()
    return { dest, pula, fee, arrives: pula - fee, reference: ref, date }
  }

  /** Savings from before the note tree: the original withdraw (any deposit's leaf proves membership). */
  async function sendFromOriginalTree(units: bigint, dest: Destination, fee: number, ref: string, date: string) {
    const kp = keypair()
    await setupAccount(kp)
    for (let attempt = 0; ; attempt++) {
      const s = await snapshot()
      const dep = s.deposits[s.deposits.length - 1]
      const path = await merklePathV1(s.leaves, dep.index)
      const nullifier = randomBytes32()
      store.addWithdrawal({ id: toHex(nullifier), nullifier: toHex(nullifier), amount: units.toString(), fee, reference: ref, date, dest })
      try {
        const res = await invokeAsync(kp, 'withdraw', [bytes32(nullifier), bytes32(fromHex(dep.rec.commitment)), bytesVec(path), u32(dep.index), address(PAYOUT_ADDRESS), i128(units)])
        store.setWithdrawalTx(toHex(nullifier), res.hash)
        res.confirmed
          .then(() => {
            addProgress({ key: 'pool-withdraw', title: 'Pool withdraw', kind: 'real', tx: res.hash })
            return runFlow('/api/flow/payout', { units: units.toString(), withdrawTx: res.hash }, (st) => addProgress(st))
          })
          .then(() => refresh())
          .catch((e) => failProgress(e instanceof Error ? e.message : String(e)))
        return
      } catch (e) {
        if (attempt === 0 && String(e).includes('Error(Contract, #4)')) continue
        throw e
      }
    }
  }

  async function transfer(pula: number, to: Payee): Promise<TransferReceipt> {
    const units = pulaToUnits(pula)
    const date = new Date().toISOString()
    const ref = reference('BLK', date)
    startProgress('sending in progress', TRANSFER_FLOW, [], `${BASENAME === '/' ? '' : BASENAME}/home`)
    try {
      const { res } = await spend(units, { kind: 'transfer', to }, date, 0, ref)
      res.confirmed
        .then(() => {
          addProgress({ key: 'pool-transfer', title: 'Pool spend: transfer inside the pool', kind: 'real', tx: res.hash })
          // For the admin page's list; the chain itself shows only nullifiers and commitments.
          void fetch('/api/transactions/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tx: res.hash, kind: 'transfer' }),
          }).catch(() => {})
          return refresh()
        })
        .catch((e) => {
          console.error('transfer', e)
          failProgress(e instanceof Error ? e.message : String(e))
        })
    } catch (e) {
      clearProgress()
      throw friendly(e)
    }
    await refresh()
    return { to: to.name, pula, reference: ref, date }
  }

  async function arrive(): Promise<Activity> {
    const rec = await depositForReceiver(pulaToUnits(ARRIVAL.pula), ARRIVAL)
    await refresh()
    return noteActivity(rec)
  }

  /**
   * A proof code that this month's deposits total at least `thresholdPula`,
   * using as few deposits as possible. Null if they fall short. (Deposits in
   * the original tree; notes are opened for lenders by their leaf index.)
   */
  async function proofCode(thresholdPula: number): Promise<string | null> {
    const s = await refresh()
    const month = monthOf()
    const need = pulaToUnits(thresholdPula)
    const picked: typeof s.deposits = []
    let total = 0n
    const candidates = s.deposits
      .filter((d) => d.rec.month === month)
      .sort((a, b) => (BigInt(b.rec.amount) > BigInt(a.rec.amount) ? 1 : -1))
    for (const d of candidates) {
      if (total >= need) break
      picked.push(d)
      total += BigInt(d.rec.amount)
    }
    if (total < need) return proofCodeFromNotes(s, thresholdPula, month, need)
    return encodeProof({
      claim: thresholdPula,
      month,
      items: await Promise.all(
        picked.map(async (d) => ({
          secret: fromHex(d.rec.secret),
          amount: BigInt(d.rec.amount),
          index: d.index,
          path: await merklePathV1(s.leaves, d.index),
        })),
      ),
    })
  }

  /** The same claim over notes received this month (not change from own spends). */
  function proofCodeFromNotes(s: Snapshot, claim: number, month: number, need: bigint): string | null {
    const picked: store.NoteRecord[] = []
    let total = 0n
    const candidates = s.notes
      .map((n) => n.rec)
      .filter((n) => !n.change && monthOf(new Date(n.date)) === month)
      .sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1))
    for (const n of candidates) {
      if (total >= need) break
      picked.push(n)
      total += BigInt(n.amount)
    }
    if (total < need) return null
    return encodeNoteProof({
      claim,
      month,
      pk: noteKeys().pk,
      items: picked.map((n) => ({ amount: BigInt(n.amount), blinding: unhex(n.blinding), index: n.index! })),
    })
  }

  const value: Savings = {
    status,
    balance: snap ? unitsToPula(snap.balanceUnits) : 0,
    activity: snap ? activityOf(snap) : [],
    sendable: snap ? unitsToPula(snap.sendableUnits) : 0,
    myId: myId(),
    send,
    transfer,
    arrive,
    proofCode,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
