// The Soroban RPC the app talks to, with failover. The SDF public testnet RPC
// (soroban-testnet.stellar.org) answers in anything from 0.04 s to 8 s per
// call, and a flow step makes several calls, so it alone made every step
// 10–25 s. The public gateway.fm and Ankr endpoints answered in ~0.1–0.3 s
// every time (measured from the server and a laptop), so they come first and
// the SDF one is the last resort. Any error (or a call over the timeout) moves
// the call to the next endpoint; a transaction re-sent that way is the same
// transaction, so that is harmless. Used by the browser and the server alike.
import { rpc } from '@stellar/stellar-sdk'

export const DEFAULT_RPC_URLS = [
  'https://soroban-rpc.testnet.stellar.gateway.fm',
  'https://rpc.ankr.com/stellar_testnet_soroban',
  'https://soroban-testnet.stellar.org',
]

/** Comma-separated VITE_RPC_URLS, or the defaults. */
export function rpcUrls(fromEnv: string | undefined): string[] {
  const list = (fromEnv ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_RPC_URLS
}

const PER_CALL_TIMEOUT_MS = 8_000

/** An rpc.Server that tries each URL in turn when a call fails or times out. */
export function rpcServer(urls: string[]): rpc.Server {
  const servers = urls.map((u) => new rpc.Server(u, { timeout: PER_CALL_TIMEOUT_MS }))
  if (servers.length === 1) return servers[0]
  return new Proxy(servers[0], {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver)
      if (typeof v !== 'function') return v
      return async (...args: unknown[]) => {
        let last: unknown
        for (const s of servers) {
          try {
            return await (s as unknown as Record<PropertyKey, (...a: unknown[]) => Promise<unknown>>)[key](...args)
          } catch (e) {
            last = e
            console.warn(`[rpc] ${String(key)} failed on ${String(s.serverURL)}: ${e instanceof Error ? e.message : String(e)}; trying the next endpoint`)
          }
        }
        throw last
      }
    },
  })
}
