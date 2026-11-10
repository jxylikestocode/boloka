/** Pula per US dollar. Savings are held in dollars and shown in pula. */
export const PULA_PER_USD = 13.5
/** Canadian dollars to pula at the sending rate. */
export const BWP_PER_CAD = 9.93
/** Savings amounts are stored in units of 1e-7 dollars (USDC). */
const UNITS_PER_USD = 10_000_000

/**
 * On-chain amounts are 1/CHAIN_SCALE of what the screens show (default
 * 1:1000), so each anchor leg fits the test anchor's 1–10 USDC limits.
 * Every conversion between pula and chain units goes through here.
 */
export const CHAIN_SCALE = Number(
  (import.meta as { env?: Record<string, string> }).env?.VITE_CHAIN_SCALE ?? '1000',
)

export const pulaToUnits = (pula: number): bigint =>
  BigInt(Math.round((pula * UNITS_PER_USD) / PULA_PER_USD / CHAIN_SCALE))

export const unitsToPula = (units: bigint): number =>
  (Number(units) * PULA_PER_USD * CHAIN_SCALE) / UNITS_PER_USD

/**
 * One month's growth at Blend's real supply rate (measured from the Blend
 * position's b_rate; see server/yieldLeg.ts). Null when not yet measured.
 */
export const monthlyGrowth = (pula: number, apr: number | null) =>
  apr === null ? null : (pula * apr) / 12

// The numbers the copy uses, in one place.
/** Per-transfer cap on the sending side (Remitly's cap). */
export const TRANSFER_CAP = 9_500
/** Orange Money's own per-transfer limit. */
export const ORANGE_LIMIT = 10_000
/** Cash out of an ATM, per withdrawal. */
export const ATM_LIMIT = 3_000
/** Debit card spending limit. */
export const CARD_LIMIT = 4_000
/** A term of school fees. */
export const SCHOOL_FEE = 24_000
/** What other routes hide in the exchange rate. */
export const HIDDEN_COST = 0.05

/** Withdrawals are free: no fee to the bank or to Orange Money. */
export const SEND_FEE = 0

/** Where money can be paid out to. Bank / school first: no per-transfer cap. */
export type Destination = 'bank' | 'orange'
export const DESTINATIONS: Record<
  Destination,
  {
    /** The action, as the parents see it. */
    action: string
    name: string
    account: string
    limit: number | null
    fee(pula: number): number
    feeLabel: string
    speed: string
    quick: number[]
    start: number
  }
> = {
  bank: {
    action: 'Pay to bank / school',
    name: 'Kalahari Bank',
    account: 'Cheque account •• 4821',
    limit: null,
    fee: () => 0,
    feeLabel: 'Fee',
    speed: 'Arrives in the bank account today',
    quick: [ATM_LIMIT, TRANSFER_CAP, SCHOOL_FEE],
    start: SCHOOL_FEE,
  },
  orange: {
    action: 'Send to Orange Money',
    name: 'Orange Money',
    account: '72 •• 391',
    limit: ORANGE_LIMIT,
    fee: () => 0,
    feeLabel: 'Fee',
    speed: 'Arrives within minutes',
    quick: [1_000, ATM_LIMIT, ORANGE_LIMIT],
    start: ATM_LIMIT,
  },
}

export function formatP(pula: number, decimals = 2) {
  return (
    'P ' +
    pula.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  )
}
