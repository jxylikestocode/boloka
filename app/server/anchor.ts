// A Stellar anchor, reached only through the shared standards, via
// @stellar/typescript-wallet-sdk: SEP-1 (stellar.toml), SEP-10 (sign-in) and
// SEP-24 (interactive deposit / withdrawal). Nothing here names a particular
// anchor: the home domain comes from config (VITE_ANCHOR_DOMAIN), so
// MoneyGram, Yellow Card or any other SEP-24 anchor is a config change.
//
// Runs server-side (dev server and scripts/demo-e2e.ts), never in the browser.
import {
  IssuedAssetId,
  SigningKeypair,
  Wallet,
  type AnchorTransaction,
  type AuthToken,
} from './walletSdk.ts'
import { Keypair } from '@stellar/stellar-sdk'
import { fillInteractiveForm } from './interactive.ts'

export type AnchorConfig = {
  /** e.g. testanchor.stellar.org */
  homeDomain: string
  /** The anchored asset the pool holds, e.g. USDC. */
  assetCode: string
}

export type Log = (step: string, detail?: Record<string, unknown>) => void

const wallet = Wallet.TestNet()

const DONE = new Set(['completed'])
const FAILED = new Set(['error', 'expired', 'refunded', 'no_market', 'too_small', 'too_large'])

export class AnchorClient {
  readonly cfg: AnchorConfig
  private anchor
  constructor(cfg: AnchorConfig) {
    this.cfg = cfg
    this.anchor = wallet.anchor({ homeDomain: cfg.homeDomain })
  }

  /** SEP-1: the anchor's issuer for the configured asset, and its limits. */
  async asset(): Promise<{ issuer: string; min: number; max: number }> {
    const toml = await this.anchor.sep1()
    const cur = toml.currencies?.find((c) => c.code === this.cfg.assetCode)
    if (!cur?.issuer) throw new Error(`${this.cfg.homeDomain} has no ${this.cfg.assetCode}`)
    const info = await this.anchor.sep24().info()
    const dep = info.deposit[this.cfg.assetCode] as { min_amount?: number; max_amount?: number; minAmount?: number; maxAmount?: number } | undefined
    return {
      issuer: cur.issuer,
      min: dep?.min_amount ?? dep?.minAmount ?? 0,
      max: dep?.max_amount ?? dep?.maxAmount ?? Infinity,
    }
  }

  /** SEP-10: a session token for `kp`. Off-chain: the challenge is signed, never submitted. */
  async signIn(kp: Keypair): Promise<AuthToken> {
    return this.anchor.sep10().then((s) => s.authenticate({ accountKp: SigningKeypair.fromSecret(kp.secret()) }))
  }

  private async waitFor(
    token: AuthToken,
    id: string,
    until: (t: AnchorTransaction) => boolean,
    log: Log,
    minutes = 6,
  ): Promise<AnchorTransaction> {
    const sep24 = this.anchor.sep24()
    let last = ''
    for (const end = Date.now() + minutes * 60_000; Date.now() < end; ) {
      const t = await sep24.getTransactionBy({ authToken: token, id })
      const status = String(t.status ?? '')
      if (status !== last) log('anchor status', { status })
      last = status
      if (until(t)) return t
      if (FAILED.has(status)) throw new Error(`Anchor ${t.kind} ${t.status}: ${t.message ?? ''}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error(`Anchor ${id} stuck in ${last}`)
  }

  /**
   * SEP-24 deposit: the anchor takes the fiat and pays `amount` of the asset
   * (less its fee) to `kp` on Stellar. The anchor's interactive KYC page is
   * completed by fillInteractiveForm with fictional test details; with a
   * production anchor the customer (or the sending app) completes it.
   */
  async deposit(kp: Keypair, amount: string, log: Log) {
    const token = await this.signIn(kp)
    log('SEP-10 signed in', { account: kp.publicKey() })
    const res = await this.anchor.sep24().deposit({
      assetCode: this.cfg.assetCode,
      authToken: token,
      destinationAccount: kp.publicKey(),
      extraFields: { amount },
    })
    if (!res.id || !res.url) throw new Error(`SEP-24 deposit: ${res.error ?? res.type}`)
    log('SEP-24 deposit started', { id: res.id })
    await fillInteractiveForm(res.url, { amount }, log)
    const t = await this.waitFor(token, res.id, (x) => DONE.has(String(x.status)), log)
    const out = t as AnchorTransaction & { stellar_transaction_id?: string; amount_out?: string; amount_fee?: string }
    log('SEP-24 deposit completed', { stellarTx: out.stellar_transaction_id, amountOut: out.amount_out })
    return { id: res.id, stellarTx: out.stellar_transaction_id ?? '', amountOut: out.amount_out ?? '' }
  }

  /**
   * SEP-24 withdrawal: after the interactive page, the anchor asks for a
   * payment of the asset to its account with a memo; we send it and wait for
   * the anchor to pay out the fiat.
   */
  async withdraw(kp: Keypair, amount: string, log: Log) {
    const { issuer } = await this.asset()
    const token = await this.signIn(kp)
    log('SEP-10 signed in', { account: kp.publicKey() })
    const sep24 = this.anchor.sep24()
    const res = await sep24.withdraw({
      assetCode: this.cfg.assetCode,
      authToken: token,
      withdrawalAccount: kp.publicKey(),
      extraFields: { amount },
    })
    if (!res.id || !res.url) throw new Error(`SEP-24 withdraw: ${res.error ?? res.type}`)
    log('SEP-24 withdrawal started', { id: res.id })
    await fillInteractiveForm(res.url, { amount }, log)
    const ready = await this.waitFor(token, res.id, (x) => x.status === 'pending_user_transfer_start', log)

    const stellar = wallet.stellar()
    const builder = await stellar.transaction({ sourceAddress: SigningKeypair.fromSecret(kp.secret()) })
    const tx = builder
      .transferWithdrawalTransaction(ready as Parameters<typeof builder.transferWithdrawalTransaction>[0], new IssuedAssetId(this.cfg.assetCode, issuer))
      .build()
    SigningKeypair.fromSecret(kp.secret()).sign(tx)
    await stellar.submitTransaction(tx)
    const paymentTx = Buffer.from(tx.hash()).toString('hex')
    log('paid the anchor', { stellarTx: paymentTx })
    await this.waitFor(token, res.id, (x) => DONE.has(String(x.status)), log)
    log('SEP-24 withdrawal completed', { id: res.id })
    return { id: res.id, stellarTx: paymentTx }
  }
}
