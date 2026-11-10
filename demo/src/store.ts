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

export const deposits = () => read<DepositRecord>(DEPOSITS)
export const withdrawals = () => read<WithdrawalRecord>(WITHDRAWALS)

export function addDeposit(d: DepositRecord) {
  localStorage.setItem(DEPOSITS, JSON.stringify([...deposits(), d]))
}

export function addWithdrawal(w: WithdrawalRecord) {
  localStorage.setItem(WITHDRAWALS, JSON.stringify([...withdrawals(), w]))
}
