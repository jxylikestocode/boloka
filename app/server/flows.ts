// The end-to-end money flows, each step recorded with its real testnet
// transaction (or marked simulated / read-only). Used by the dev server for
// the apps and by scripts/demo-e2e.ts.
//
//   deposit: SEP-10 → SEP-24 deposit → pool deposit → Blend supply → yield read
//   payout:  pool withdraw (done in the parent's browser) → Blend withdraw → SEP-10 → SEP-24 withdrawal
import { Keypair } from '@stellar/stellar-sdk'
import { AnchorClient } from './anchor.ts'
import type { ServerConfig } from './config.ts'
import type { Roles } from './accounts.ts'
import { address, bytes32, i128, invoke, tokenBalance } from './soroban.ts'
import * as yieldLeg from './yieldLeg.ts'

export type StepKey =
  | 'sep10'
  | 'sep24-deposit'
  | 'pool-deposit'
  | 'blend-supply'
  | 'yield-read'
  | 'pool-withdraw'
  | 'blend-withdraw'
  | 'sep24-withdraw'

export type Step = {
  key: StepKey
  title: string
  /** real: a submitted testnet transaction; offchain/read: real but no tx; simulated: not performed. */
  kind: 'real' | 'offchain' | 'read' | 'simulated'
  tx?: string
  note?: string
  data?: Record<string, unknown>
  at: string
}

export type Recorder = { step(s: Omit<Step, 'at'>): void; log(msg: string, d?: Record<string, unknown>): void }

const USDC = (units: bigint) => Number(units) / 1e7

/** Anchor amount string: at least `min`, at most `max`, 2 decimals. */
const clampAmount = (usdc: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.ceil(usdc * 100) / 100)).toFixed(2)

export async function depositFlow(
  cfg: ServerConfig,
  who: Pick<Roles, 'sender' | 'yield'>,
  commitment: Uint8Array,
  units: bigint,
  rec: Recorder,
) {
  const anchor = new AnchorClient({ homeDomain: cfg.anchorDomain, assetCode: cfg.asset.split(':')[0] })
  const { min, max } = await anchor.asset()
  const sender = who.sender
  const log = (m: string, d?: Record<string, unknown>) => rec.log(m, d)

  // SEP-24 deposit of the anchor's USDC into the sender's settlement account.
  // Always at least one real deposit; the test anchor takes 1–10 USDC and
  // keeps a fee (about 10%), so ask for enough to cover the transfer.
  let balance = await tokenBalance(cfg.tokenId, sender.publicKey())
  let first = true
  do {
    const short = units > balance ? units - balance : 0n
    const amount = clampAmount(USDC(short) / 0.9, min || 1, max === Infinity ? 10 : max)
    const d = await anchor.deposit(sender, amount, (m, data) => {
      log(m, data)
      if (m === 'SEP-10 signed in' && first) {
        rec.step({
          key: 'sep10',
          title: 'SEP-10 sign-in with the anchor',
          kind: 'offchain',
          note: `${cfg.anchorDomain} issued a session token after the account signed its challenge (signed, never submitted, so no transaction).`,
          data: { account: sender.publicKey(), anchor: cfg.anchorDomain },
        })
      }
    })
    rec.step({
      key: 'sep24-deposit',
      title: 'SEP-24 deposit: anchor pays USDC to the sender',
      kind: 'real',
      tx: d.stellarTx,
      note: `Requested ${amount} USDC, received ${d.amountOut} after the anchor's fee. The anchor's KYC page was completed automatically with fictional test details (test anchor only).`,
      data: { anchorTxId: d.id, requested: amount, received: d.amountOut },
    })
    first = false
    balance = await tokenBalance(cfg.tokenId, sender.publicKey())
  } while (balance < units)

  const poolTx = await invoke(sender, cfg.poolId, 'deposit', [
    address(sender.publicKey()),
    bytes32(commitment),
    i128(units),
  ])
  rec.step({
    key: 'pool-deposit',
    title: 'Pool deposit for the parents (commitment only)',
    kind: 'real',
    tx: poolTx,
    data: { usdc: USDC(units), pool: cfg.poolId },
  })

  const supplyTx = await yieldLeg.supply(cfg, who.yield, units)
  yieldLeg.addPrincipal(who.yield.publicKey(), units)
  rec.step({
    key: 'blend-supply',
    title: 'Blend supply (mirror, Blend mock USDC)',
    kind: 'real',
    tx: supplyTx,
    note: "Blend's testnet pool doesn't list Circle's USDC, so the same amount of Blend's mock USDC is supplied by the yield account. On mainnet the pool supplies its own USDC.",
    data: { usdc: USDC(units), blendPool: cfg.blendPool },
  })

  const pos = await yieldLeg.readPosition(cfg, who.yield.publicKey())
  rec.step({
    key: 'yield-read',
    title: 'Yield read from the real Blend position',
    kind: 'read',
    note: 'get_reserve + get_positions (read-only). Value = b-tokens × b_rate / 1e12.',
    data: {
      bTokens: pos.bTokens.toString(),
      bRate: pos.bRate.toString(),
      valueUsdc: USDC(pos.valueUnits),
      measuredApr: yieldLeg.measuredApr(),
    },
  })
  return { poolTx, supplyTx }
}

export async function payoutFlow(
  cfg: ServerConfig,
  who: Pick<Roles, 'payout' | 'yield'>,
  units: bigint,
  poolWithdrawTx: string | null,
  rec: Recorder,
) {
  if (poolWithdrawTx) {
    rec.step({
      key: 'pool-withdraw',
      title: 'Pool withdraw to the payout account',
      kind: 'real',
      tx: poolWithdrawTx,
      data: { usdc: USDC(units) },
    })
  }
  const withdrawTx = await yieldLeg.withdraw(cfg, who.yield, units)
  yieldLeg.addPrincipal(who.yield.publicKey(), -units)
  rec.step({
    key: 'blend-withdraw',
    title: 'Blend withdraw (mirror)',
    kind: 'real',
    tx: withdrawTx,
    data: { usdc: USDC(units) },
  })

  const anchor = new AnchorClient({ homeDomain: cfg.anchorDomain, assetCode: cfg.asset.split(':')[0] })
  const { min } = await anchor.asset()
  const amount = (Math.floor(USDC(units) * 100) / 100).toFixed(2)
  if (Number(amount) < (min || 1)) {
    rec.step({
      key: 'sep24-withdraw',
      title: 'SEP-24 withdrawal to the anchor',
      kind: 'simulated',
      note: `${amount} USDC is below the test anchor's ${min || 1} USDC minimum at display scale 1:${cfg.scale}, so this payout's anchor leg is simulated. The pool withdrawal above is real.`,
    })
    return { anchorTx: null }
  }
  const w = await anchor.withdraw(who.payout, amount, (m, d) => rec.log(m, d))
  rec.step({
    key: 'sep24-withdraw',
    title: 'SEP-24 withdrawal: USDC to the anchor, fiat out',
    kind: 'real',
    tx: w.stellarTx,
    note: "Payment of USDC to the anchor's account with its memo; the anchor then completes the fiat payout. KYC page completed automatically with fictional test details.",
    data: { anchorTxId: w.id, usdc: amount },
  })
  return { anchorTx: w.stellarTx }
}

export const keypairFrom = (secret: string) => Keypair.fromSecret(secret)
