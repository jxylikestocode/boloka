// Demo build: the anchor leg (SEP-10 sign-in, SEP-24 deposit) is played back
// with the same statuses a real anchor reports, without any network calls.
import { wait } from './mock.ts'

export const ANCHOR_DOMAIN = 'testanchor.stellar.org'

export type AnchorInfo = { domain: string; usdc: string }
export type AnchorTx = { id: string; status: string; stellar_transaction_id?: string }

export async function discover(): Promise<AnchorInfo> {
  await wait(500)
  return { domain: ANCHOR_DOMAIN, usdc: 'USDC:demo' }
}

export async function signIn(_a: AnchorInfo, _kp: unknown): Promise<string> {
  await wait(900)
  return 'demo-token'
}

export async function startDeposit(_a: AnchorInfo, _t: string, _acct: string, _amount: string) {
  await wait(700)
  return { id: 'demo', url: '' }
}

export async function waitForDeposit(
  _a: AnchorInfo,
  _t: string,
  id: string,
  onStatus: (t: AnchorTx) => void,
  _cancelled: (t: AnchorTx) => boolean,
): Promise<AnchorTx> {
  for (const status of ['incomplete', 'pending_anchor', 'pending_stellar']) {
    onStatus({ id, status })
    await wait(1300)
  }
  return { id, status: 'completed' }
}

/** SEP-12, played back: the sender's verified details reach the anchor. */
export async function sendCustomer(
  _a: AnchorInfo,
  _t: string,
  _account: string,
  _fields: Record<string, string>,
): Promise<void> {
  await wait(900)
}

/** SEP-6, played back: the anchor registers the deposit. */
export async function registerDeposit(
  _a: AnchorInfo,
  _t: string,
  _account: string,
  _amount: string,
): Promise<string> {
  await wait(800)
  return 'demo'
}
