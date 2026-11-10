// Talking to the pool contract on testnet.
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk'
import { ASSET, NETWORK_PASSPHRASE, POOL_ID, RPC_URLS, TOKEN_ID } from './config.ts'
import { rpcServer } from './rpc.ts'
import { toHex } from './proof.ts'

const server = rpcServer(RPC_URLS)
const pool = new Contract(POOL_ID)

// Argument encoders matching the contract's parameter types.
export const bytes32 = (b: Uint8Array) => xdr.ScVal.scvBytes(b)
export const bytesVec = (bs: Uint8Array[]) => xdr.ScVal.scvVec(bs.map(bytes32))
export const u32 = (n: number) => nativeToScVal(n, { type: 'u32' })
export const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' })
export const address = (a: string) => new Address(a).toScVal()

/** A keypair created on first use and kept in localStorage under `storageKey`. */
function storedKeypair(storageKey: string): Keypair {
  const saved = localStorage.getItem(storageKey)
  if (saved) return Keypair.fromSecret(saved)
  const kp = Keypair.random()
  localStorage.setItem(storageKey, kp.secret())
  return kp
}

/** The receiver's keypair: the person using the savings screens. */
export const keypair = () => storedKeypair('savings.key')
/** The sender's keypair, used by the mock MoneyGram flow at /send. */
export const senderKeypair = () => storedKeypair('savings.senderKey')

const setups = new Map<string, Promise<void>>()

/**
 * Funds the account with friendbot if it's new and adds a trustline for
 * `assetSpec` ("CODE:ISSUER", by default the pool's asset), once per account
 * and asset per browser. Keyed by asset, so an account set up for an earlier
 * pool's token still gets to trust the current one.
 */
export function setupAccount(kp: Keypair, assetSpec = ASSET): Promise<void> {
  const pub = kp.publicKey()
  const key = `${pub}.${assetSpec}`
  const readyKey = `savings.ready.${key}`
  let setup = setups.get(key)
  if (!setup) {
    setup = (async () => {
      if (localStorage.getItem(readyKey)) return
      try {
        await server.getAccount(pub)
      } catch {
        await server.fundAddress(pub)
      }
      const [code, issuer] = assetSpec.split(':')
      await submit(
        keypairSigner(kp),
        await build(pub, Operation.changeTrust({ asset: new Asset(code, issuer) })),
      )
      localStorage.setItem(readyKey, '1')
    })().catch((e) => {
      setups.delete(key)
      throw e
    })
    setups.set(key, setup)
  }
  return setup
}

/**
 * Something that can sign transactions for `address`: a local keypair, or a
 * wallet extension such as Freighter.
 */
export type Signer = {
  address: string
  /** Takes and returns a base64 transaction envelope. */
  sign(txXdr: string): Promise<string>
}

export const keypairSigner = (kp: Keypair): Signer => ({
  address: kp.publicKey(),
  async sign(txXdr) {
    const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE) as Transaction
    tx.sign(kp)
    return tx.toXDR()
  },
})

async function build(source: string, op: xdr.Operation): Promise<Transaction> {
  const account = await server.getAccount(source)
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build()
}

/**
 * Signs and submits; resolves as soon as the network has accepted the
 * transaction, with `confirmed` settling when it is in a ledger.
 */
async function send(signer: Signer, tx: Transaction) {
  const signed = TransactionBuilder.fromXDR(
    await signer.sign(tx.toXDR()),
    NETWORK_PASSPHRASE,
  ) as Transaction
  const sent = await server.sendTransaction(signed)
  if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
    throw new Error(`submit failed: ${sent.status}`)
  }
  const confirmed = server.pollTransaction(sent.hash, { attempts: 30 }).then((res) => {
    if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`transaction ${sent.hash} ${res.status}`)
    }
    return res
  })
  return { hash: sent.hash, confirmed }
}

async function submit(signer: Signer, tx: Transaction) {
  const { hash, confirmed } = await send(signer, tx)
  return { ...(await confirmed), hash }
}

/**
 * Calls a pool function in a transaction signed by `signer` and waits for it
 * to land. Throws the simulation error (e.g. "Error(Contract, #8)") if the
 * call would fail.
 */
export async function invokeAs(signer: Signer, method: string, args: xdr.ScVal[]) {
  const tx = await server.prepareTransaction(
    await build(signer.address, pool.call(method, ...args)),
  )
  // Simulation records, but does not check, signatures other than the
  // signer's own. Refuse up front rather than fail after submitting.
  const auth = (tx.operations[0] as { auth?: xdr.SorobanAuthorizationEntry[] }).auth ?? []
  const others = auth.flatMap((a) => {
    const c = a.credentials
    switch (c.type) {
      case 'sorobanCredentialsSourceAccount':
        return []
      case 'sorobanCredentialsAddress':
        return [Address.fromScAddress(c.address.address).toString()]
      case 'sorobanCredentialsAddressV2':
        return [Address.fromScAddress(c.addressV2.address).toString()]
      case 'sorobanCredentialsAddressWithDelegates':
        return [Address.fromScAddress(c.addressWithDelegates.addressCredentials.address).toString()]
      default:
        return ['another account']
    }
  })
  if (others.length) throw new Error(`NeedsSignatureFrom ${others.join(', ')}`)
  return submit(signer, tx)
}

/** Like invoke, but resolves on submission; `confirmed` settles later. */
export async function invokeAsync(kp: Keypair, method: string, args: xdr.ScVal[]) {
  const signer = keypairSigner(kp)
  const tx = await server.prepareTransaction(await build(signer.address, pool.call(method, ...args)))
  return send(signer, tx)
}

/** invokeAs with a local keypair. */
export const invoke = (kp: Keypair, method: string, args: xdr.ScVal[]) =>
  invokeAs(keypairSigner(kp), method, args)

/**
 * Calls a read-only contract function by simulation; needs no account.
 * `contractId` defaults to the pool.
 */
export async function simulate(
  method: string,
  args: xdr.ScVal[],
  contractId = POOL_ID,
): Promise<unknown> {
  const source = new Account(Keypair.random().publicKey(), '0')
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  if (!sim.result) throw new Error('simulation returned no result')
  return scValToNative(sim.result.retval)
}

/**
 * The pool's settings from its instance storage (the contract has no getters):
 * admin, cap in basis points, and the Blend pool it lends to.
 */
export async function readPoolConfig() {
  const entry = await server.getContractData(
    POOL_ID,
    xdr.ScVal.scvLedgerKeyContractInstance(),
    rpc.Durability.Persistent,
  )
  if (entry.val.type !== 'contractData') throw new Error('unexpected pool entry')
  const v = entry.val.contractData.val
  if (v.type !== 'scvContractInstance') throw new Error('unexpected pool instance')
  const get = (name: string) => {
    const want = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]).toXdr('base64')
    const hit = (v.instance.storage ?? []).find((e) => e.key.toXdr('base64') === want)
    if (!hit) throw new Error(`pool has no ${name}; is it initialised?`)
    return scValToNative(hit.val)
  }
  return {
    admin: get('Admin') as string,
    maxBps: Number(get('MaxBps')),
    blendPool: get('BlendPool') as string,
  }
}

/** Idle tokens in the pool, its value lent to Blend, and their sum (1e-7 USDC). */
export async function readPoolFunds() {
  // The pool holds the anchor's (Circle's) USDC, which Blend's testnet pool
  // doesn't list, so on testnet its lending is the Blend MIRROR position
  // (server/yieldLeg.ts), read from the dev server. (The contract's own
  // total_assets view would ask Blend about Circle's USDC and fail.)
  const [liquid, mirror] = await Promise.all([
    simulate('balance', [address(POOL_ID)], TOKEN_ID) as Promise<bigint>,
    fetch('/api/yield').then((r) => (r.ok ? (r.json() as Promise<{ valueUnits: string }>) : { valueUnits: '0' })),
  ])
  const lent = BigInt(mirror.valueUnits)
  return { liquid, lent, total: liquid + lent }
}

// The contract's storage keys, as its #[contracttype] DataKey enum encodes them.
const leavesKey = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Leaves')])
const nullifierKey = (n: Uint8Array) =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Nullifier'), bytes32(n)])
const ledgerKey = (key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(POOL_ID).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  )

/**
 * Reads, in one request, every leaf in the pool and which of `nullifiers`
 * have been used.
 */
export async function readPool(nullifiers: Uint8Array[]) {
  const keys = [leavesKey, ...nullifiers.map(nullifierKey)]
  const wanted = new Map(keys.map((k, i) => [k.toXdr('base64'), i]))
  const leaves: Uint8Array[] = []
  const used = new Set<string>()
  // getLedgerEntries takes at most 200 keys per call.
  for (let at = 0; at < keys.length; at += 200) {
    const res = await server.getLedgerEntries(...keys.slice(at, at + 200).map(ledgerKey))
    for (const e of res.entries) {
      if (e.val.type !== 'contractData') continue
      const data = e.val.contractData
      const i = wanted.get(data.key.toXdr('base64'))
      if (i === 0) {
        if (data.val.type !== 'scvVec') throw new Error('unexpected leaves value')
        for (const v of data.val.vec ?? []) {
          if (v.type !== 'scvBytes') throw new Error('unexpected leaf value')
          leaves.push(v.bytes.toBytes())
        }
      } else if (i !== undefined) {
        used.add(toHex(nullifiers[i - 1]))
      }
    }
  }
  return { leaves, used }
}
