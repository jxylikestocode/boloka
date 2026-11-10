// Demo build: savings live in this browser's localStorage only. Same
// interface as the real provider, with short pauses where the network was.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { depositForReceiver } from './deposit.ts'
import { wait } from './mock.ts'
import { DEPTH, encodeProof, fromHex, monthOf, randomBytes32 } from './proof.ts'
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
const ARRIVAL = { pula: 9900, sender: 'Lerato', via: 'MoneyGram' }

const sum = (xs: { amount: string }[]) => xs.reduce((n, x) => n + BigInt(x.amount), 0n)

const depositActivity = (d: store.DepositRecord): Activity => ({
  id: d.id,
  kind: 'in',
  title: d.sender,
  detail: d.via,
  pula: unitsToPula(BigInt(d.amount)),
  date: d.date,
})

function read() {
  const deposits = store.deposits()
  const withdrawals = store.withdrawals()
  const activity = [
    ...deposits.map(depositActivity),
    ...withdrawals.map(
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
  return { deposits, balanceUnits: sum(deposits) - sum(withdrawals), activity }
}

export function SavingsProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(read)
  const refresh = useCallback(() => {
    const s = read()
    setSnap(s)
    return s
  }, [])

  // MoneyGram runs as a separate app (another window or tab). Its transfers
  // land in shared storage, so pick them up as they happen.
  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener('storage', onChange)
    window.addEventListener('focus', onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [refresh])

  async function send(pula: number, dest: Destination): Promise<SendReceipt> {
    const units = pulaToUnits(pula)
    if (units > refresh().balanceUnits) throw new Error('That is more than your savings.')
    await wait(1800)
    const date = new Date().toISOString()
    const reference = `${dest === 'bank' ? 'EFT' : 'OM'}${date.slice(2, 10).replace(/-/g, '')}.${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`
    const id = Math.random().toString(16).slice(2)
    const fee = DESTINATIONS[dest].fee(pula)
    store.addWithdrawal({ id, nullifier: id, amount: units.toString(), fee, reference, date, dest })
    refresh()
    return { dest, pula, fee, arrives: pula - fee, reference, date }
  }

  async function arrive(): Promise<Activity> {
    const rec = await depositForReceiver(null, pulaToUnits(ARRIVAL.pula), ARRIVAL)
    refresh()
    return depositActivity(rec)
  }

  /** A proof code from this month's largest deposits; null if they fall short. */
  async function proofCode(thresholdPula: number): Promise<string | null> {
    await wait(1600)
    const s = refresh()
    const month = monthOf()
    const need = pulaToUnits(thresholdPula)
    const picked: store.DepositRecord[] = []
    let total = 0n
    const candidates = s.deposits
      .filter((d) => d.month === month)
      .sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1))
    for (const d of candidates) {
      if (total >= need) break
      picked.push(d)
      total += BigInt(d.amount)
    }
    if (total < need) return null
    return encodeProof({
      claim: thresholdPula,
      month,
      items: picked.map((d, i) => ({
        secret: fromHex(d.secret),
        amount: BigInt(d.amount),
        index: i,
        path: Array.from({ length: DEPTH }, randomBytes32),
      })),
    })
  }

  const value: Savings = {
    status: 'ready',
    balance: unitsToPula(snap.balanceUnits),
    activity: snap.activity,
    send,
    arrive,
    proofCode,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
