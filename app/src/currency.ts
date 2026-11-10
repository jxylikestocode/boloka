// The parents' display currency: pula (default) or US dollars, flipped with
// the P / $ switch on Home and remembered per browser. Balances and history
// follow it; the payout screen stays in pula because the bank and Orange
// Money receive pula. Conversion uses money.ts's rate; the balance itself is
// held in dollars either way.
import { useSyncExternalStore } from 'react'
import { PULA_PER_USD } from './money.ts'

export type Currency = 'BWP' | 'USD'

const KEY = 'ui.currency'
const listeners = new Set<() => void>()

function read(): Currency {
  try {
    return localStorage.getItem(KEY) === 'USD' ? 'USD' : 'BWP'
  } catch {
    return 'BWP'
  }
}

export function setCurrency(c: Currency) {
  localStorage.setItem(KEY, c)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('storage', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', l)
  }
}

export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, read, () => 'BWP')
}

/** "P 9,930" or "$ 735.56" for an amount kept in pula. `whole` drops pula cents (dollars keep theirs). */
export function money(pula: number, cur: Currency, opts: { whole?: boolean } = {}): string {
  if (cur === 'USD') {
    return '$ ' + (pula / PULA_PER_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const n = opts.whole ? Math.round(pula) : pula
  const isWhole = Math.abs(n - Math.round(n)) < 0.005
  return 'P ' + n.toLocaleString('en-US', { minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: isWhole ? 0 : 2 })
}

/** The current currency and a formatter bound to it. */
export function useMoney() {
  const cur = useCurrency()
  return { cur, symbol: cur === 'USD' ? '$' : 'P', m: (pula: number, opts?: { whole?: boolean }) => money(pula, cur, opts) }
}
