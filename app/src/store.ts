// Records kept only in this browser. A record counts once the pool confirms
// it: a deposit's leaf is in the tree, or a withdrawal's nullifier is used.

export type DepositRecord = {
  id: string
  /** hex; the opening of the leaf, with amount and month. */
  secret: string
  /** In units of 1e-7 dollars. */
  amount: string
  month: number
  /** hex leaf: sha256(secret || amount || month) */
  commitment: string
  sender: string
  via: string
  date: string
  /** Its transfer failed before reaching the pool. */
  failed?: boolean
}

export type WithdrawalRecord = {
  id: string
  /** hex */
  nullifier: string
  /** In units of 1e-7 dollars. */
  amount: string
  fee: number
  reference: string
  date: string
  /** Where it went; older records without one went to Orange Money. */
  dest?: 'bank' | 'orange'
  /** Hash of the pool withdrawal, once submitted. */
  tx?: string
}

const DEPOSITS = 'savings.deposits'
const WITHDRAWALS = 'savings.withdrawals'

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

export const deposits = () =>
  // Records saved before the sender was renamed still say "Lerato".
  read<DepositRecord>(DEPOSITS).map((d) => (d.sender === 'Lerato' ? { ...d, sender: 'Kate' } : d))
export const withdrawals = () => read<WithdrawalRecord>(WITHDRAWALS)

export function addDeposit(d: DepositRecord) {
  localStorage.setItem(DEPOSITS, JSON.stringify([...deposits(), d]))
}

export function addWithdrawal(w: WithdrawalRecord) {
  localStorage.setItem(WITHDRAWALS, JSON.stringify([...withdrawals(), w]))
}

export function markDepositFailed(id: string) {
  localStorage.setItem(DEPOSITS, JSON.stringify(deposits().map((d) => (d.id === id ? { ...d, failed: true } : d))))
}

export function setWithdrawalTx(id: string, tx: string) {
  localStorage.setItem(
    WITHDRAWALS,
    JSON.stringify(withdrawals().map((w) => (w.id === id ? { ...w, tx } : w))),
  )
}
