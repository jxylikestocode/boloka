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
  invoke,
  keypair,
  readPool,
  setupAccount,
  u32,
} from './chain.ts'
import { depositForReceiver, runFlow } from './deposit.ts'
import { addProgress, PAYOUT_FLOW, startProgress } from './progress.ts'
import {
  encodeProof,
  fromHex,
  merklePath,
  monthOf,
  randomBytes32,
  toHex,
} from './proof.ts'
import * as store from './store.ts'
import { DESTINATIONS, pulaToUnits, unitsToPula, type Destination } from './money.ts'

export type Activity = {
  id: string
  kind: 'in' | 'out'
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

type Savings = {
  status: 'loading' | 'ready' | 'error'
  balance: number
  activity: Activity[]
  send(pula: number, dest: Destination): Promise<SendReceipt>
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

type Snapshot = {
  leaves: Uint8Array[]
  /** This user's deposits found in the tree, with their leaf index. */
  deposits: { rec: store.DepositRecord; index: number }[]
  withdrawals: store.WithdrawalRecord[]
  balanceUnits: bigint
}

/** Reconciles the local records with what the pool has confirmed. */
async function snapshot(): Promise<Snapshot> {
  const allW = store.withdrawals()
  const { leaves, used } = await readPool(allW.map((w) => fromHex(w.nullifier)))
  const position = new Map(leaves.map((l, i) => [toHex(l), i]))
  const deposits = store
    .deposits()
    .filter((d) => position.has(d.commitment))
    .map((rec) => ({ rec, index: position.get(rec.commitment)! }))
  const withdrawals = allW.filter((w) => used.has(w.nullifier))
  const balanceUnits =
    deposits.reduce((n, d) => n + BigInt(d.rec.amount), 0n) -
    withdrawals.reduce((n, w) => n + BigInt(w.amount), 0n)
  return { leaves, deposits, withdrawals, balanceUnits }
}

const depositActivity = (d: store.DepositRecord): Activity => ({
  id: d.id,
  kind: 'in',
  title: d.sender,
  detail: d.via,
  pula: unitsToPula(BigInt(d.amount)),
  date: d.date,
})

function activityOf(s: Snapshot): Activity[] {
  return [
    ...s.deposits.map((d) => depositActivity(d.rec)),
    ...s.withdrawals.map(
      (w): Activity => ({
        id: w.id,
        kind: 'out',
        title: DESTINATIONS[w.dest ?? 'orange'].name,
        detail: 'Sent',
        pula: unitsToPula(BigInt(w.amount)),
        date: w.date,
      }),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

/** Turns contract failures into something a person can act on. */
function friendly(e: unknown): Error {
  console.error(e)
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('Error(Contract, #4)')) {
    return new Error('Your savings changed while sending. Please try again.')
  }
  return new Error('That did not go through. Please try again.')
}

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
    refresh()
      .then(() => setStatus('ready'))
      .catch((e) => {
        console.error(e)
        setStatus('error')
      })
  }, [refresh])

  // MoneyGram runs as a separate app; its transfers reach this app through
  // the shared records ('storage') and count once the pool confirms them, so
  // also re-read the pool every few seconds.
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
    const t = setInterval(tick, 5000)
    return () => {
      window.removeEventListener('storage', tick)
      window.removeEventListener('focus', tick)
      clearInterval(t)
    }
  }, [refresh])

  async function send(pula: number, dest: Destination): Promise<SendReceipt> {
    const kp = keypair()
    await setupAccount(kp).catch((e) => {
      throw friendly(e)
    })
    const units = pulaToUnits(pula)
    const date = new Date().toISOString()
    const fee = DESTINATIONS[dest].fee(pula)
    const reference = `${dest === 'bank' ? 'EFT' : 'OM'}${date.slice(2, 10).replace(/-/g, '')}.${Math.floor(
      Math.random() * 1e6,
    )
      .toString()
      .padStart(6, '0')}`
    // Any confirmed deposit proves membership; the newest is as good as any.
    // A deposit landing between reading the tree and sending changes the
    // root, so rebuild the path and retry once if that happens.
    for (let attempt = 0; ; attempt++) {
      const s = await snapshot()
      if (units > s.balanceUnits) throw new Error('That is more than your savings.')
      const dep = s.deposits[s.deposits.length - 1]
      const path = await merklePath(s.leaves, dep.index)
      const nullifier = randomBytes32()
      // Saved before sending; it only counts once the pool has used it.
      store.addWithdrawal({
        id: toHex(nullifier),
        nullifier: toHex(nullifier),
        amount: units.toString(),
        fee,
        reference,
        date,
        dest,
      })
      try {
        const res = await invoke(kp, 'withdraw', [
          bytes32(nullifier),
          bytes32(fromHex(dep.rec.commitment)),
          bytesVec(path),
          u32(dep.index),
          address(PAYOUT_ADDRESS),
          i128(units),
        ])
        // The pool paid the payout account; it now pays out through the
        // anchor (SEP-24 withdrawal), mirrored out of Blend. That runs on in
        // the background: the parents' part is done.
        store.setWithdrawalTx(toHex(nullifier), res.hash)
        // For the demo's under-the-hood strip: the pool step is done, the rest follows.
        startProgress('payout in progress', PAYOUT_FLOW, [
          { key: 'pool-withdraw', title: 'Pool withdraw', kind: 'real', tx: res.hash },
        ])
        runFlow('/api/flow/payout', { units: units.toString(), withdrawTx: res.hash }, (s) => addProgress(s)).catch(
          (e) => console.error('payout flow', e),
        )
        break
      } catch (e) {
        if (attempt === 0 && String(e).includes('Error(Contract, #4)')) continue
        throw friendly(e)
      }
    }
    await refresh()
    return { dest, pula, fee, arrives: pula - fee, reference, date }
  }

  async function arrive(): Promise<Activity> {
    const rec = await depositForReceiver(pulaToUnits(ARRIVAL.pula), ARRIVAL)
    await refresh()
    return depositActivity(rec)
  }

  /**
   * A proof code that this month's deposits total at least `thresholdPula`,
   * using as few deposits as possible. Null if they fall short.
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
    if (total < need) return null
    return encodeProof({
      claim: thresholdPula,
      month,
      items: await Promise.all(
        picked.map(async (d) => ({
          secret: fromHex(d.rec.secret),
          amount: BigInt(d.rec.amount),
          index: d.index,
          path: await merklePath(s.leaves, d.index),
        })),
      ),
    })
  }

  const value: Savings = {
    status,
    balance: snap ? unitsToPula(snap.balanceUnits) : 0,
    activity: snap ? activityOf(snap) : [],
    send,
    arrive,
    proofCode,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
