// The yield leg — a MIRROR, read this first.
//
// The pool holds the anchor's USDC (Circle's testnet USDC). Blend's testnet
// pool doesn't list that token; it lists Blend's own mock USDC. So the pool
// contract never lends its own funds on testnet. Instead a separate "yield"
// account supplies the SAME AMOUNT of Blend's mock USDC to the Blend testnet
// pool for every pool deposit (and withdraws it for every payout), and the
// interest the parents see is read back from that real Blend position
// (b_rate × b-tokens). On mainnet, with one USDC, the pool contract's own
// supply_to_blend / withdraw_from_blend do this directly.
import { Keypair, TransactionBuilder, Transaction, xdr, nativeToScVal } from '@stellar/stellar-sdk'
import { address, invoke, NETWORK, server, simulate } from './soroban.ts'
import { storage } from './storage.ts'

const FAUCET = 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets?userId='
const B_RATE_SCALAR = 1_000_000_000_000n
const SUPPLY_COLLATERAL = 2
const WITHDRAW_COLLATERAL = 3
const STATE_FILE = 'yield-state.json'

export type YieldConfig = { blendPool: string; blendUsdcId: string; blendUsdcAsset: string }

/** Blend's Request{address, amount, request_type}, as a sorted ScVal map. */
function request(token: string, amount: bigint, type: number) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('address'), val: address(token) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: nativeToScVal(amount, { type: 'i128' }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('request_type'), val: nativeToScVal(type, { type: 'u32' }) }),
  ])
}

function submit(cfg: YieldConfig, kp: Keypair, amount: bigint, type: number) {
  const me = kp.publicKey()
  return invoke(kp, cfg.blendPool, 'submit', [
    address(me),
    address(me),
    address(me),
    xdr.ScVal.scvVec([request(cfg.blendUsdcId, amount, type)]),
  ])
}

/** Mirror a pool deposit: supply `amount` of Blend's mock USDC to Blend. */
export const supply = (cfg: YieldConfig, kp: Keypair, amount: bigint) =>
  submit(cfg, kp, amount, SUPPLY_COLLATERAL)

/** Mirror a payout: withdraw `amount` (Blend clamps to the position). */
export const withdraw = (cfg: YieldConfig, kp: Keypair, amount: bigint) =>
  submit(cfg, kp, amount, WITHDRAW_COLLATERAL)

export type Position = { bTokens: bigint; bRate: bigint; valueUnits: bigint; at: number }

/** Reads the real Blend position of `who` (read-only, no transaction). */
export async function readPosition(cfg: YieldConfig, who: string): Promise<Position> {
  const reserve = (await simulate(cfg.blendPool, 'get_reserve', [address(cfg.blendUsdcId)], who)) as {
    config: { index: number }
    data: { b_rate: bigint }
  }
  const positions = (await simulate(cfg.blendPool, 'get_positions', [address(who)], who)) as {
    collateral: Record<string, bigint> | Map<number, bigint>
  }
  const idx = reserve.config.index
  const col = positions.collateral
  const bTokens = BigInt((col instanceof Map ? col.get(idx) : col[String(idx)]) ?? 0n)
  const bRate = BigInt(reserve.data.b_rate)
  await recordSample(bRate)
  return { bTokens, bRate, valueUnits: (bTokens * bRate) / B_RATE_SCALAR, at: Date.now() }
}

type YieldState = { samples: { t: number; bRate: string }[]; principal: Record<string, string>; baseline?: Record<string, string> }

async function loadState(): Promise<YieldState> {
  const raw = await storage.read(STATE_FILE)
  return raw ? (JSON.parse(raw) as YieldState) : { samples: [], principal: {} }
}
const saveState = (s: YieldState) => storage.write(STATE_FILE, JSON.stringify(s))

/** Keeps the first b_rate seen and the latest, to measure Blend's real rate. */
async function recordSample(bRate: bigint) {
  const s = await loadState()
  const sample = { t: Date.now(), bRate: bRate.toString() }
  s.samples = s.samples.length ? [s.samples[0], sample] : [sample]
  await saveState(s)
}

/**
 * Blend's real supply rate for this reserve, annualised from b_rate growth
 * between the first recorded sample and now. Null until 10 minutes apart.
 */
export async function measuredApr(): Promise<number | null> {
  const { samples } = await loadState()
  if (samples.length < 2) return null
  const [a, b] = samples
  const dt = (b.t - a.t) / 1000
  if (dt < 600) return null
  const growth = Number(BigInt(b.bRate) * 1_000_000_000n / BigInt(a.bRate)) / 1e9
  return Math.pow(growth, 31_536_000 / dt) - 1
}

/**
 * Position value this server first saw that it has no supply history for
 * (e.g. a fresh volume): recorded once, so "earned" counts growth from then.
 */
export async function baseline(who: string, valueUnits: bigint, principalUnits: bigint): Promise<bigint> {
  const s = await loadState()
  s.baseline ??= {}
  if (s.baseline[who] === undefined) {
    const b = valueUnits - principalUnits
    s.baseline[who] = (b > 0n ? b : 0n).toString()
    await saveState(s)
  }
  return BigInt(s.baseline[who])
}

/** Principal supplied by the app's yield account (supplies − withdrawals). */
export async function principal(who: string): Promise<bigint> {
  return BigInt((await loadState()).principal[who] ?? '0')
}
export async function addPrincipal(who: string, delta: bigint) {
  const s = await loadState()
  const next = BigInt(s.principal[who] ?? '0') + delta
  s.principal[who] = (next > 0n ? next : 0n).toString()
  await saveState(s)
}

/**
 * Gives a fresh account Blend's mock USDC from Blend's testnet faucet (1,000
 * per new account). The faucet transaction is checked before signing: it may
 * only add trustlines for this account and pay this account.
 */
export async function claimBlendUsdc(kp: Keypair, issuer: string) {
  const me = kp.publicKey()
  const res = await fetch(FAUCET + me)
  if (!res.ok) throw new Error(`Blend faucet ${res.status}`)
  const tx = TransactionBuilder.fromXDR(JSON.parse(await res.text()), NETWORK)
  if (!(tx instanceof Transaction) || tx.source !== issuer) throw new Error('unexpected faucet tx')
  for (const op of tx.operations) {
    const ok =
      (op.type === 'changeTrust' && op.source === me) ||
      (op.type === 'payment' && op.source === issuer && op.destination === me)
    if (!ok) throw new Error(`unexpected faucet op ${op.type}`)
  }
  if (!tx.operations.length) throw new Error('Blend faucet gave nothing (account already claimed)')
  tx.sign(kp)
  const sent = await server.sendTransaction(tx)
  const r = await server.pollTransaction(sent.hash, { attempts: 60 })
  if (r.status !== 'SUCCESS') throw new Error(`faucet tx ${r.status}`)
  return sent.hash
}
