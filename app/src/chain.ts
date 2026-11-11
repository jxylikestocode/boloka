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
import { scoped } from './profile.ts'
import { fieldScVal, fieldsScVal, memosScVal, proofScVal, type Groth16Proof } from './notes.ts'

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

/** The receiver's keypair: the person using the savings screens (this phone's profile). */
export const keypair = () => storedKeypair(scoped('savings.key'))
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

// ----- The note tree (contracts/pool: deposit_note / spend) -----

const noteLeavesKey = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('NoteLeaves')])
const noteKey = (i: number) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Note'), u32(i)])
const spentKey = (n: Uint8Array) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Spent'), bytes32(n)])

/** Reads persistent entries by key, in batches; absent keys are simply missing from the result. */
async function readEntries(keys: xdr.ScVal[]): Promise<Map<string, xdr.ScVal>> {
  const out = new Map<string, xdr.ScVal>()
  for (let at = 0; at < keys.length; at += 200) {
    const res = await server.getLedgerEntries(...keys.slice(at, at + 200).map(ledgerKey))
    for (const e of res.entries) {
      if (e.val.type !== 'contractData') continue
      out.set(e.val.contractData.key.toXdr('base64'), e.val.contractData.val)
    }
  }
  return out
}

/** Every note commitment in the note tree, in leaf order. */
export async function readNoteLeaves(): Promise<Uint8Array[]> {
  const got = await readEntries([noteLeavesKey])
  const v = got.get(noteLeavesKey.toXdr('base64'))
  if (!v) return []
  if (v.type !== 'scvVec') throw new Error('unexpected note leaves value')
  return (v.vec ?? []).map((x) => {
    if (x.type !== 'scvBytes') throw new Error('unexpected note leaf')
    return x.bytes.toBytes()
  })
}

export type NoteEntry = { commitment: Uint8Array; memo: Uint8Array; at: number }

/** The stored notes (commitment, memo, time) at these leaf indexes. */
export async function readNotes(indexes: number[]): Promise<Map<number, NoteEntry>> {
  const keys = indexes.map(noteKey)
  const got = await readEntries(keys)
  const out = new Map<number, NoteEntry>()
  indexes.forEach((i, k) => {
    const v = got.get(keys[k].toXdr('base64'))
    if (!v) return
    const n = scValToNative(v) as { commitment: Uint8Array; memo: Uint8Array; at: bigint }
    out.set(i, { commitment: new Uint8Array(n.commitment), memo: new Uint8Array(n.memo), at: Number(n.at) })
  })
  return out
}

/** Which of these nullifiers the pool has seen spent (hex). */
export async function readSpent(nullifiers: Uint8Array[]): Promise<Set<string>> {
  if (nullifiers.length === 0) return new Set()
  const keys = nullifiers.map(spentKey)
  const got = await readEntries(keys)
  return new Set(nullifiers.filter((_, k) => got.has(keys[k].toXdr('base64'))).map(toHex))
}

/**
 * Submits a spend: the proof and its public values, the memos of the two new
 * notes, what the pool pays out (0 for a transfer) and to whom. Resolves on
 * submission; `confirmed` settles when it is in a ledger.
 */
export function spendNotes(
  kp: Keypair,
  s: { proof: Groth16Proof; root: bigint; nullifiers: bigint[]; commitments: bigint[]; memos: Uint8Array[]; amount: bigint; to: string },
) {
  return invokeAsync(kp, 'spend', [
    proofScVal(s.proof),
    fieldScVal(s.root),
    fieldsScVal(s.nullifiers),
    fieldsScVal(s.commitments),
    memosScVal(s.memos),
    i128(s.amount),
    address(s.to),
  ])
}
