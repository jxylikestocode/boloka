// Server-side settings, read from app/.env (the same file the browser app
// gets its VITE_* values from), so the dev server and scripts agree.
import { existsSync, readFileSync } from 'node:fs'
import { rpcUrls } from '../src/rpc.ts'

const ENV_FILE = new URL('../.env', import.meta.url)

export function readEnv(): Record<string, string> {
  const fromFile = existsSync(ENV_FILE)
    ? Object.fromEntries(
        readFileSync(ENV_FILE, 'utf8')
          .split('\n')
          .filter((l) => /^[A-Z0-9_]+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}
  // Environment variables (the cloud's settings) win over the file.
  const fromEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => k.startsWith('VITE_') && v) as [string, string][],
  )
  return { ...fromFile, ...fromEnv }
}

export type ServerConfig = {
  rpcUrl: string
  /** Pool contract (holds the anchor's USDC). */
  poolId: string
  /** The anchor's USDC token contract (SAC) and classic asset "CODE:ISSUER". */
  tokenId: string
  asset: string
  /** Anchor home domain: change this to swap anchors (MoneyGram, Yellow Card, …). */
  anchorDomain: string
  /** Blend testnet pool and Blend's own mock USDC (the yield mirror's token). */
  blendPool: string
  /** The account pool withdrawals are paid to; a relayed transfer binds it as a dummy recipient. */
  payoutAddress: string
  blendUsdcId: string
  blendUsdcAsset: string
  /** On-chain amounts are 1/scale of the amounts the screens show. */
  scale: number
}

export function serverConfig(env = readEnv()): ServerConfig {
  const need = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`${k} is missing from app/.env (run ../deploy.sh)`)
    return v
  }
  return {
    rpcUrl: rpcUrls(env.VITE_RPC_URLS)[0],
    poolId: need('VITE_POOL_ID'),
    tokenId: need('VITE_TOKEN_ID'),
    asset: need('VITE_ASSET'),
    anchorDomain: need('VITE_ANCHOR_DOMAIN'),
    blendPool: need('VITE_BLEND_POOL'),
    payoutAddress: need('VITE_PAYOUT_ADDRESS'),
    blendUsdcId: need('VITE_BLEND_USDC_ID'),
    blendUsdcAsset: need('VITE_BLEND_USDC_ASSET'),
    scale: Number(env.VITE_CHAIN_SCALE ?? '1000'),
  }
}
