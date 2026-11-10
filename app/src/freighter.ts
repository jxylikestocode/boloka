// Signing with the Freighter browser extension, so admin keys stay in the
// wallet and never reach the app.
import {
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api'
import type { Signer } from './chain.ts'
import { NETWORK_PASSPHRASE } from './config.ts'

const fail = (e: { message: string } | undefined, fallback: string): never => {
  throw new Error(e?.message || fallback)
}

/**
 * Asks Freighter for access and returns a signer for its current account.
 * Throws if Freighter is missing, refused, or not on testnet.
 */
export async function connectFreighter(): Promise<Signer> {
  const conn = await isConnected()
  if (conn.error || !conn.isConnected) {
    fail(undefined, 'Freighter is not installed or not enabled in this browser.')
  }
  const access = await requestAccess()
  if (access.error || !access.address) fail(access.error, 'Freighter did not share an account.')
  const net = await getNetworkDetails()
  if (net.error) fail(net.error, 'Could not read Freighter’s network.')
  if (net.networkPassphrase !== NETWORK_PASSPHRASE) {
    fail(undefined, `Freighter is on ${net.network}. Switch it to Testnet and connect again.`)
  }

  const address = access.address
  return {
    address,
    async sign(txXdr) {
      const r = await signTransaction(txXdr, { networkPassphrase: NETWORK_PASSPHRASE, address })
      if (r.error) fail(r.error, 'Freighter did not sign.')
      return r.signedTxXdr
    },
  }
}
