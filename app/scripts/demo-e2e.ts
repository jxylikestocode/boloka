// npm run demo:e2e — the whole Boloka flow on Stellar testnet from FRESH
// friendbot accounts, printing every step with its transaction hash and
// saving the run to app/.runs/ (the judges' "How it works" page shows the
// latest run).
//
//   Kate in Canada sends $10,000 CAD   → P 99,300 for the parents
//   the parents pay the school fee     → P 24,000 to the school's bank
//
// Amounts on chain are 1/CHAIN_SCALE of the amounts shown (default 1:1000),
// so each anchor leg fits the test anchor's 1–10 USDC limits.
import { mkdirSync, writeFileSync } from 'node:fs'
import { Keypair } from '@stellar/stellar-sdk'
import { createRole } from '../server/accounts.ts'
import { serverConfig } from '../server/config.ts'
import { depositFlow, payoutFlow, type Recorder, type Step } from '../server/flows.ts'
import { address, bytes32, bytesVec, i128, invoke, poolLeaves, server, u32, explorer } from '../server/soroban.ts'
import { commitment, merklePath, monthOf, randomBytes32, toHex } from '../src/proof.ts'
import * as ledger from '../server/ledger.ts'
import { dataPath } from '../server/paths.ts'
import { join } from 'node:path'

const cfg = serverConfig()
const PULA_PER_USD = 13.5
const BWP_PER_CAD = 9.93
const units = (pula: number) => BigInt(Math.round((pula / PULA_PER_USD / cfg.scale) * 1e7))

const SEND_CAD = Number(process.env.SEND_CAD ?? 10_000)
const SCHOOL_FEE = Number(process.env.SCHOOL_FEE ?? 24_000)

const steps: Step[] = []
const t0 = Date.now()
const runId = `e2e-${new Date().toISOString().replace(/[:.]/g, '-')}`
const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`.padStart(5)
const rec: Recorder = {
  step(s) {
    const step = { ...s, at: new Date().toISOString() }
    steps.push(step)
    ledger.append({ ...step, flow: 'e2e', flowId: runId })
    const tag = { real: 'REAL', offchain: 'OFF-CHAIN', read: 'READ', simulated: 'SIMULATED' }[s.kind]
    console.log(`\n${secs()}  ✔ ${s.title}  [${tag}]`)
    if (s.tx) console.log(`        tx ${s.tx}\n        ${explorer(s.tx)}`)
    if (s.note) console.log(`        ${s.note}`)
  },
  log(m, d) {
    if (process.env.VERBOSE) console.log(`${secs()}    · ${m} ${d ? JSON.stringify(d) : ''}`)
  },
}

console.log(`Boloka end-to-end on Stellar testnet
  anchor   ${cfg.anchorDomain}
  pool     ${cfg.poolId}
  USDC     ${cfg.asset} (pool) · ${cfg.blendUsdcAsset} (Blend mirror)
  scale    1:${cfg.scale} (P 1,000 on screen = ${(1000 / PULA_PER_USD / cfg.scale).toFixed(4)} USDC on chain)`)

console.log('\nCreating fresh friendbot accounts…')
const [sender, payout, yieldKp, parent] = await Promise.all([
  createRole('sender', cfg),
  createRole('payout', cfg),
  createRole('yield', cfg),
  (async () => {
    const kp = Keypair.random()
    await server.fundAddress(kp.publicKey())
    return kp
  })(),
])
const accounts = {
  sender: sender.publicKey(),
  payout: payout.publicKey(),
  yield: yieldKp.publicKey(),
  parent: parent.publicKey(),
}
for (const [k, v] of Object.entries(accounts)) console.log(`  ${k.padEnd(7)} ${v}`)

// 1. Kate sends $10,000 CAD; P 99,300 arrives for the parents.
const pula = Math.round(SEND_CAD * BWP_PER_CAD)
const depositUnits = units(pula)
console.log(`\n— Send: $${SEND_CAD.toLocaleString('en-US')} CAD → P ${pula.toLocaleString('en-US')} (${Number(depositUnits) / 1e7} USDC on chain)`)
const secret = randomBytes32()
const month = monthOf()
const leaf = await commitment(secret, depositUnits, month)
await depositFlow(cfg, { sender, yield: yieldKp }, leaf, depositUnits, rec)

// 2. The parents pay the school fee straight to the school's bank.
const feeUnits = units(SCHOOL_FEE)
console.log(`\n— Pay school fees: P ${SCHOOL_FEE.toLocaleString('en-US')} (${Number(feeUnits) / 1e7} USDC on chain)`)
const leaves = await poolLeaves(cfg.poolId)
const index = leaves.findIndex((l) => toHex(l) === toHex(leaf))
if (index < 0) throw new Error('deposit not found in the pool')
const path = await merklePath(leaves, index)
const nullifier = randomBytes32()
const withdrawTx = await invoke(parent, cfg.poolId, 'withdraw', [
  bytes32(nullifier),
  bytes32(leaf),
  bytesVec(path),
  u32(index),
  address(payout.publicKey()),
  i128(feeUnits),
])
await payoutFlow(cfg, { payout, yield: yieldKp }, feeUnits, withdrawTx, rec)

const run = {
  finishedAt: new Date().toISOString(),
  seconds: Math.round((Date.now() - t0) / 1000),
  anchor: cfg.anchorDomain,
  pool: cfg.poolId,
  asset: cfg.asset,
  blend: { pool: cfg.blendPool, usdc: cfg.blendUsdcAsset },
  scale: cfg.scale,
  scenario: { sendCad: SEND_CAD, arrivesPula: pula, schoolFeePula: SCHOOL_FEE },
  accounts,
  steps,
}
const runs = dataPath('.runs')
mkdirSync(runs, { recursive: true })
const stamp = run.finishedAt.replace(/[:.]/g, '-')
writeFileSync(join(runs, `${stamp}.json`), JSON.stringify(run, null, 2))
writeFileSync(join(runs, 'latest.json'), JSON.stringify(run, null, 2))
console.log(`\nDone in ${run.seconds}s. Saved to app/.runs/latest.json (shown on /how-it-works).`)
