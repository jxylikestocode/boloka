// Minimal Soroban/Stellar helpers for the server side (Node), mirroring what
// src/chain.ts does in the browser.
import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import { toHex } from '../src/proof.ts'

export const NETWORK = Networks.TESTNET
export const server = new rpc.Server('https://soroban-testnet.stellar.org')

export const bytes32 = (b: Uint8Array) => xdr.ScVal.scvBytes(b)
export const bytesVec = (bs: Uint8Array[]) => xdr.ScVal.scvVec(bs.map(bytes32))
export const u32 = (n: number) => nativeToScVal(n, { type: 'u32' })
export const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' })
export const address = (a: string) => new Address(a).toScVal()

const explorer = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`
export { explorer }

async function send(tx: ReturnType<TransactionBuilder['build']>, kp: Keypair): Promise<string> {
  tx.sign(kp)
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`)
  const res = await server.pollTransaction(sent.hash, { attempts: 60 })
  if (res.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ${res.status}`)
  return sent.hash
}

/** Calls `method` on `contractId` as `kp`; returns the transaction hash. */
export async function invoke(kp: Keypair, contractId: string, method: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(await server.getAccount(kp.publicKey()), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build()
  return send(await server.prepareTransaction(tx), kp)
}

/** Read-only call (simulation); no transaction is submitted. */
export async function simulate(contractId: string, method: string, args: xdr.ScVal[], source: string) {
  const tx = new TransactionBuilder(await server.getAccount(source), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulate ${method}: ${sim.error}`)
  return scValToNative(sim.result!.retval)
}

/** Friendbot-funds `kp` if new and adds trustlines for each "CODE:ISSUER". */
export async function prepareAccount(kp: Keypair, assets: string[]) {
  try {
    await server.getAccount(kp.publicKey())
  } catch {
    await server.fundAddress(kp.publicKey())
  }
  const b = new TransactionBuilder(await server.getAccount(kp.publicKey()), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
  for (const a of assets) {
    const [code, issuer] = a.split(':')
    b.addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
  }
  if (assets.length) await send(b.setTimeout(60).build(), kp)
}

/** Token balance of `who` on a token contract, in 1e-7 units. */
export async function tokenBalance(tokenId: string, who: string, source = who): Promise<bigint> {
  return BigInt(await simulate(tokenId, 'balance', [address(who)], source))
}

const POOL_LEAVES = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Leaves')])

/** The pool's deposit leaves, in order (to build Merkle paths). */
export async function poolLeaves(poolId: string): Promise<Uint8Array[]> {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(poolId).toScAddress(),
      key: POOL_LEAVES,
      durability: xdr.ContractDataDurability.persistent,
    }),
  )
  const res = await server.getLedgerEntries(key)
  const e = res.entries[0]
  if (!e || e.val.type !== 'contractData') return []
  const v = e.val.contractData.val
  if (v.type !== 'scvVec') throw new Error('unexpected leaves value')
  return (v.vec ?? []).map((x) => {
    if (x.type !== 'scvBytes') throw new Error('unexpected leaf value')
    return x.bytes.toBytes()
  })
}

export const hex = toHex
