// The end-to-end money flows, each step recorded with its real testnet
// transaction (or marked simulated / read-only). Used by the dev server for
// the apps and by scripts/demo-e2e.ts.
//
//   deposit: pool deposit from the settlement FLOAT ‖ Blend supply → (SEP-10 → SEP-24 deposit
//            refills the float ‖ yield read). The float is the sender role's USDC balance,
//            kept at or above one transfer, the way a remittance payout partner is pre-funded:
//            the parents see the money in ~10 s, the anchor settlement completes behind it.
//            An empty float (first run) is funded by the anchor first, then refilled.
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

  // The settlement float: the sender role's USDC, topped up by the anchor.
  let balance = await tokenBalance(cfg.tokenId, sender.publicKey())
  let signedIn = false

  // SEP-24 deposits of the anchor's USDC into the float until it covers one
  // transfer. Always at least one real deposit per transfer; the test anchor
  // takes 1–10 USDC and keeps a fee (about 10%), so ask for enough.
  const topUp = async (why: 'refill' | 'fund') => {
    do {
      const short = units > balance ? units - balance : 0n
      const amount = clampAmount(USDC(short) / 0.9, min || 1, max === Infinity ? 10 : max)
      const d = await anchor.deposit(sender, amount, (m, data) => {
        log(m, data)
        if (m === 'SEP-10 signed in' && !signedIn) {
          signedIn = true
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
        title: why === 'refill' ? 'SEP-24 deposit: anchor refills the settlement float in USDC' : 'SEP-24 deposit: anchor funds the settlement float in USDC',
        kind: 'real',
        tx: d.stellarTx,
        note:
          (why === 'refill'
            ? 'The parents were paid from the float above; this is the anchor settling the money in behind it. '
            : 'The float was short, so the anchor settled the money in before the pool deposit. ') +
          `Requested ${amount} USDC, received ${d.amountOut} after the anchor's fee. The anchor's KYC page was completed automatically with fictional test details (test anchor only).`,
        data: { anchorTxId: d.id, requested: amount, received: d.amountOut, float: why },
      })
      const got = Number(d.amountOut)
      balance = Number.isFinite(got) && got > 0 ? balance + BigInt(Math.round(got * 1e7)) : await tokenBalance(cfg.tokenId, sender.publicKey())
    } while (balance < units)
  }

  const funded = balance >= units
  if (!funded) {
    log('float short', { have: USDC(balance), need: USDC(units) })
    await topUp('fund')
  }

  // The parents' deposit and its Blend mirror run together (different accounts).
  const [poolTx, supplyTx] = await Promise.all([
    invoke(sender, cfg.poolId, 'deposit', [address(sender.publicKey()), bytes32(commitment), i128(units)]).then((tx) => {
      rec.step({
        key: 'pool-deposit',
        title: 'Pool deposit for the parents (commitment only)',
        kind: 'real',
        tx,
        note: funded
          ? 'Paid from the settlement float straight away (pre-funded, as a remittance payout partner is); the anchor refills the float below.'
          : undefined,
        data: { usdc: USDC(units), pool: cfg.poolId, commitment: Buffer.from(commitment).toString('hex'), float: funded ? 'pre-funded' : 'funded first' },
      })
      return tx
    }),
    yieldLeg.supply(cfg, who.yield, units).then(async (tx) => {
      await yieldLeg.addPrincipal(who.yield.publicKey(), units)
      rec.step({
        key: 'blend-supply',
        title: 'Blend supply (mirror, Blend mock USDC)',
        kind: 'real',
        tx,
        note: "Blend's testnet pool doesn't list Circle's USDC, so the same amount of Blend's mock USDC is supplied by the yield account. On mainnet the pool supplies its own USDC.",
        data: { usdc: USDC(units), blendPool: cfg.blendPool },
      })
      return tx
    }),
  ])
  balance -= units

  // Behind the parents' screen: the anchor refills the float (always at least
  // once, so every transfer has its real anchor leg) while the yield is read.
  await Promise.all([
    topUp('refill'),
    yieldLeg.readPosition(cfg, who.yield.publicKey()).then(async (pos) =>
      rec.step({
        key: 'yield-read',
        title: 'Yield read from the real Blend position',
        kind: 'read',
        note: 'get_reserve + get_positions (read-only). Value = b-tokens × b_rate / 1e12.',
        data: {
          bTokens: pos.bTokens.toString(),
          bRate: pos.bRate.toString(),
          valueUsdc: USDC(pos.valueUnits),
          measuredApr: await yieldLeg.measuredApr(),
        },
      }),
    ),
  ])
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
  await yieldLeg.addPrincipal(who.yield.publicKey(), -units)
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
