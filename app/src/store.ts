// Records kept in this browser (and shared with the other apps by sync.ts),
// under this phone's profile. A record counts once the pool confirms it: a
// note's commitment is in the note tree, a spend's nullifiers are used.
//
// The pool's original SHA-256 tree (deposits / withdrawals) and its note
// tree (notes / spends) have separate records; the original ones are kept
// so savings from before the note tree still open.
import { scoped } from './profile.ts'

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

/** A note in the pool's note tree that this account owns (see notes.ts). */
export type NoteRecord = {
  /** hex commitment, the record's id. */
  id: string
  /** In units of 1e-7 dollars. */
  amount: string
  /** hex field element. */
  blinding: string
  /** Leaf index, once the note is seen in the tree. */
  index?: number
  /** Who it came from, as the owner sees it ("Kate", "Mom"). */
  from: string
  /** How: "MoneyGram", "Boloka". */
  via: string
  date: string
  /** Its transfer failed before reaching the pool. */
  failed?: boolean
  /** Change from this account's own spend (not an arrival). */
  change?: boolean
}

/** A spend of this account's notes: a payout out of the pool or a transfer inside it. */
export type SpendRecord = {
  /** hex of the first nullifier. */
  id: string
  /** hex nullifiers of the notes spent. */
  nullifiers: string[]
  /** What left this account, in units of 1e-7 dollars (the change note stays). */
  amount: string
  kind: 'payout' | 'transfer'
  /** Payouts: where. */
  dest?: 'bank' | 'orange'
  /** Transfers: the recipient's name. */
  to?: string
  fee: number
  reference: string
  date: string
  /** Hash of the pool transaction, once submitted. */
  tx?: string
}

const DEPOSITS = scoped('savings.deposits')
const WITHDRAWALS = scoped('savings.withdrawals')
const NOTES = scoped('savings.notes')
const SPENDS = scoped('savings.spends')
/** How many leaves of the note tree this account has looked at for its memos. */
const SCANNED = scoped('savings.scanned')

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

const write = (key: string, list: unknown[]) => localStorage.setItem(key, JSON.stringify(list))

const upsert = <T extends { id: string }>(key: string, rec: T) => {
  const list = read<T>(key)
  write(key, list.some((r) => r.id === rec.id) ? list.map((r) => (r.id === rec.id ? { ...r, ...rec } : r)) : [...list, rec])
}

export const deposits = () =>
  // Records saved before the sender was renamed still say "Lerato".
  read<DepositRecord>(DEPOSITS).map((d) => (d.sender === 'Lerato' ? { ...d, sender: 'Kate' } : d))
export const withdrawals = () => read<WithdrawalRecord>(WITHDRAWALS)

export function addDeposit(d: DepositRecord) {
  write(DEPOSITS, [...deposits(), d])
}

export function addWithdrawal(w: WithdrawalRecord) {
  write(WITHDRAWALS, [...withdrawals(), w])
}

export function markDepositFailed(id: string) {
  write(DEPOSITS, deposits().map((d) => (d.id === id ? { ...d, failed: true } : d)))
}

export function setWithdrawalTx(id: string, tx: string) {
  write(WITHDRAWALS, withdrawals().map((w) => (w.id === id ? { ...w, tx } : w)))
}

export const notes = () => read<NoteRecord>(NOTES)
export const spends = () => read<SpendRecord>(SPENDS)

/** Adds a note, or updates the one with the same commitment (e.g. with its index). */
export const putNote = (n: NoteRecord) => upsert(NOTES, n)

export function markNoteFailed(id: string) {
  write(NOTES, notes().map((n) => (n.id === id ? { ...n, failed: true } : n)))
}

export const putSpend = (s: SpendRecord) => upsert(SPENDS, s)

export function setSpendTx(id: string, tx: string) {
  write(SPENDS, spends().map((s) => (s.id === id ? { ...s, tx } : s)))
}

export const scanned = () => Number(localStorage.getItem(SCANNED) ?? '0') || 0
export const setScanned = (n: number) => localStorage.setItem(SCANNED, String(n))
