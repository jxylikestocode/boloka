// Loads @stellar/typescript-wallet-sdk under Node 25+. Its bundled JWT
// dependency (buffer-equal-constant-time) reads buffer.SlowBuffer, which
// Node 25 removed; alias it to Buffer before the SDK loads. The SDK ships as
// CommonJS, so its classes come from the default export.
import nodeBuffer from 'node:buffer'

const b = nodeBuffer as unknown as { SlowBuffer?: unknown; Buffer: unknown }
b.SlowBuffer ??= b.Buffer

const mod = await import('@stellar/typescript-wallet-sdk')
const sdk = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod

export const { Wallet, SigningKeypair, IssuedAssetId } = sdk
import type { Types } from '@stellar/typescript-wallet-sdk'
export type AnchorTransaction = Types.AnchorTransaction
export type AuthToken = Types.AuthToken
