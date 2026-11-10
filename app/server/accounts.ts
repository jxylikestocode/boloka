// The server-side testnet accounts the prototype acts with:
//   sender — the remittance company's settlement account: receives the
//            anchor's SEP-24 deposit and deposits it into the pool
//   payout — receives pool withdrawals and pays them out via SEP-24
//   yield  — holds Blend's mock USDC for the Blend mirror (see yieldLeg.ts)
// Kept in app/.accounts.json (gitignored). Testnet only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair } from '@stellar/stellar-sdk'
import type { ServerConfig } from './config.ts'
import { prepareAccount, server } from './soroban.ts'
import { claimBlendUsdc } from './yieldLeg.ts'
import { dataPath } from './paths.ts'

export type Roles = { sender: Keypair; payout: Keypair; yield: Keypair }
const FILE = () => dataPath('.accounts.json')

/** Creates and funds a role account (friendbot, trustlines, Blend USDC for yield). */
export async function createRole(role: keyof Roles, cfg: ServerConfig): Promise<Keypair> {
  const kp = Keypair.random()
  if (role === 'yield') {
    await server.fundAddress(kp.publicKey())
    await claimBlendUsdc(kp, cfg.blendUsdcAsset.split(':')[1])
  } else {
    await prepareAccount(kp, [cfg.asset])
  }
  return kp
}

/** The app's persistent role accounts, created on first use. */
export async function roles(cfg: ServerConfig): Promise<Roles> {
  // ACCOUNTS_JSON (a cloud secret) wins, so the deployed server uses the same
  // role accounts as the pool was set up with (the payout address is baked
  // into the app). Otherwise the file in DATA_DIR, created on first use.
  const saved = process.env.ACCOUNTS_JSON
    ? (JSON.parse(process.env.ACCOUNTS_JSON) as Record<string, string>)
    : existsSync(FILE())
      ? (JSON.parse(readFileSync(FILE(), 'utf8')) as Record<string, string>)
      : {}
  const out = {} as Roles
  for (const role of ['sender', 'payout', 'yield'] as const) {
    if (saved[role]) {
      out[role] = Keypair.fromSecret(saved[role])
    } else {
      out[role] = await createRole(role, cfg)
      saved[role] = out[role].secret()
      writeFileSync(FILE(), JSON.stringify(saved, null, 2))
    }
  }
  return out
}
