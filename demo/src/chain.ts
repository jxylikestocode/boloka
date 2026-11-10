// Demo build: stands in for the testnet calls with local state.
import { ADMIN } from './config.ts'
import { fakeHash, wait } from './mock.ts'
import { deposits, withdrawals } from './store.ts'

export type Signer = { address: string; sign(txXdr: string): Promise<string> }

/** Stand-in for a keypair: only the address is ever read. */
type DemoKey = { publicKey(): string }
const demoKey = (address: string): DemoKey => ({ publicKey: () => address })
export const keypair = () => demoKey('GRECEIVERDEMO')
export const senderKeypair = () => demoKey('GSENDERDEMO')

export async function setupAccount(_kp?: DemoKey, _asset?: string): Promise<void> {
  await wait(400)
}

const UNITS = 10_000_000n
const sum = (xs: { amount: string }[]) => xs.reduce((n, x) => n + BigInt(x.amount), 0n)
/** What the pool held before this browser's transfers: 100 idle, 100 lent. */
const BASE_IDLE = 100n * UNITS
const BASE_LENT = 100n * UNITS
const APR = 0.045
const LENT_KEY = 'demo.lent'

/** Lent principal plus interest since it was set, ticking every second. */
function lentNow(): bigint {
  const saved = JSON.parse(localStorage.getItem(LENT_KEY) ?? 'null') as
    | { units: string; at: number }
    | null
  const s = saved ?? { units: BASE_LENT.toString(), at: Date.now() - 86_400_000 }
  const secs = (Date.now() - s.at) / 1000
  const growth = Number(s.units) * APR * (secs / 31_536_000)
  return BigInt(s.units) + BigInt(Math.floor(growth))
}
const setLent = (units: bigint) =>
  localStorage.setItem(LENT_KEY, JSON.stringify({ units: units.toString(), at: Date.now() }))

/** Idle USDC: the base plus deposits, less payouts, less what was moved to Blend. */
function idleNow(): bigint {
  const moved = BigInt(localStorage.getItem('demo.moved') ?? '0')
  return BASE_IDLE + sum(deposits()) - sum(withdrawals()) - moved
}

export async function readPoolConfig() {
  await wait(300)
  return { admin: ADMIN, maxBps: 5000, blendPool: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF' }
}

export async function readPoolFunds() {
  await wait(200)
  const liquid = idleNow()
  const lent = lentNow()
  return { liquid, lent, total: liquid + lent }
}

export const i128 = (n: bigint) => n

/** Lend to / recall from Blend against the local pool state. */
export async function invokeAs(signer: Signer, method: string, args: bigint[]) {
  await signer.sign('demo')
  await wait(1800)
  const amount = args[0]
  const liquid = idleNow()
  const lent = lentNow()
  const moved = BigInt(localStorage.getItem('demo.moved') ?? '0')
  if (method === 'supply_to_blend') {
    if (amount > liquid) throw new Error('Error(Contract, #9)')
    if ((lent + amount) * 10_000n > (liquid + lent) * 5000n) throw new Error('Error(Contract, #8)')
    setLent(lent + amount)
    localStorage.setItem('demo.moved', (moved + amount).toString())
  } else {
    const out = amount > lent ? lent : amount
    setLent(lent - out)
    localStorage.setItem('demo.moved', (moved - out).toString())
  }
  return { hash: fakeHash() }
}
