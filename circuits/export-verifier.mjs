// Converts snarkjs' verification_key.json (circuits/build) into the pool
// contract's VerificationKey: BN254 points in the host's uncompressed encoding
// (app/src/notes.ts g1 / g2). Writes
//   circuits/build/vk.json             the --vk argument of `stellar contract invoke -- set_verifier`
//   contracts/pool/src/fixtures/vk.bin alpha ‖ beta ‖ gamma ‖ delta ‖ ic…, for the contract tests
//   node circuits/export-verifier.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { concat, g1, g2, toHex } from '../app/src/notes.ts'

const here = dirname(fileURLToPath(import.meta.url))
const vk = JSON.parse(readFileSync(join(here, 'build/verification_key.json'), 'utf8'))
if (vk.protocol !== 'groth16' || vk.curve !== 'bn128') throw new Error(`unexpected key: ${vk.protocol} over ${vk.curve}`)

const alpha = g1(vk.vk_alpha_1)
const beta = g2(vk.vk_beta_2)
const gamma = g2(vk.vk_gamma_2)
const delta = g2(vk.vk_delta_2)
const ic = vk.IC.map(g1)

writeFileSync(
  join(here, 'build/vk.json'),
  JSON.stringify({ alpha: toHex(alpha), beta: toHex(beta), gamma: toHex(gamma), delta: toHex(delta), ic: ic.map(toHex) }),
)
const fixtures = join(here, '../contracts/pool/src/fixtures')
mkdirSync(fixtures, { recursive: true })
writeFileSync(join(fixtures, 'vk.bin'), concat(alpha, beta, gamma, delta, ...ic))
console.log(`verification key: ${vk.nPublic} public signals, ${ic.length} IC points → build/vk.json, fixtures/vk.bin`)
