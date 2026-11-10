import { Networks } from '@stellar/stellar-sdk'

function env(name: string): string {
  const v = import.meta.env[name] as string | undefined
  if (!v) throw new Error(`${name} is missing from app/.env (run ../deploy.sh)`)
  return v
}

export const RPC_URL = 'https://soroban-testnet.stellar.org'
export const NETWORK_PASSPHRASE = Networks.TESTNET

export const POOL_ID = env('VITE_POOL_ID')
export const TOKEN_ID = env('VITE_TOKEN_ID')
/** "CODE:ISSUER" of the asset the pool holds. */
export const ASSET = env('VITE_ASSET')
/** Where "Send to Orange Money" pays out to. */
export const PAYOUT_ADDRESS = env('VITE_PAYOUT_ADDRESS')
/** Blend's testnet lending pool (the yield mirror supplies to it). */
export const BLEND_POOL = env('VITE_BLEND_POOL')
