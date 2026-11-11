// Dev-server API for the apps (registered by vite.config.ts):
//   POST /api/flow/deposit {commitment, units}      → {id}   MoneyGram → pool
//   POST /api/flow/payout  {units, withdrawTx}       → {id}   pool → anchor
//   GET  /api/flow/<id>                              → {status, steps, error}
//   GET  /api/yield                                  → the real Blend mirror position
//   GET  /api/runs/latest                            → latest demo:e2e run
// Flows run one at a time: they share the role accounts' sequence numbers.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { roles } from './accounts.ts'
import { serverConfig } from './config.ts'
import { depositFlow, payoutFlow, type Step } from './flows.ts'
import { fromHex } from '../src/proof.ts'
import * as yieldLeg from './yieldLeg.ts'
import * as ledger from './ledger.ts'
import { forDevice } from './chainTx.ts'
import { storage } from './storage.ts'

type Job = { id: string; flow: 'deposit' | 'payout'; status: 'running' | 'done' | 'error'; steps: Step[]; error?: string }
// Jobs live in memory for the process that runs them and in storage, so a
// poll still finds them after a restart.
const jobs = new Map<string, Job>()
const saveJob = (job: Job) => storage.write(`jobs/${job.id}.json`, JSON.stringify(job)).catch((e) => console.error('[job]', e))
let queue: Promise<unknown> = Promise.resolve()

function start(flow: Job['flow'], run: (job: Job) => Promise<unknown>): string {
  const id = Math.random().toString(36).slice(2)
  const job: Job = { id, flow, status: 'running', steps: [] }
  jobs.set(id, job)
  const next = queue
    .then(() => saveJob(job))
    .then(() =>
      run(job).then(
        () => (job.status = 'done'),
        (e: unknown) => {
          console.error('[flow]', e)
          job.status = 'error'
          job.error = e instanceof Error ? e.message : String(e)
        },
      ),
    )
    .then(() => saveJob(job))
  queue = next.catch(() => {})
  return id
}

/** A restart kills in-flight flows: mark their saved jobs failed so no screen waits forever. */
export async function recoverStaleJobs() {
  for (const name of await storage.list('jobs/')) {
    try {
      const job = JSON.parse((await storage.read(name)) ?? 'null') as Job | null
      if (job?.status === 'running') {
        job.status = 'error'
        job.error = 'The server restarted during this transfer. Please send it again.'
        await storage.write(name, JSON.stringify(job))
        console.log('[job] marked failed after restart:', job.id)
      }
    } catch {
      // not a job file
    }
  }
}

// Logs carry the seconds since the flow started, so slow steps are visible in `fly logs`.
const recorder = (job: Job) => {
  const t0 = Date.now()
  const tag = () => `[flow ${job.id} +${((Date.now() - t0) / 1000).toFixed(1)}s]`
  return {
    step: (s: Omit<Step, 'at'>) => {
      const step = { ...s, at: new Date().toISOString() }
      job.steps.push(step)
      console.log(tag(), 'step', s.key, s.tx ?? '')
      void saveJob(job)
      void ledger.append({ ...step, flow: job.flow, flowId: job.id })
    },
    log: (m: string, d?: Record<string, unknown>) => console.log(tag(), m, d ? JSON.stringify(d) : ''),
  }
}

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch (e) {
        reject(e)
      }
    })
  })
}

const UNITS = /^[1-9]\d{0,15}$/

const DIRECTORY = 'directory.json'
type DirectoryEntry = { profile: string; name: string; id: string }
async function loadDirectory(): Promise<DirectoryEntry[]> {
  try {
    return JSON.parse((await storage.read(DIRECTORY)) ?? '[]') as DirectoryEntry[]
  } catch {
    return []
  }
}

export async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? ''
  if (!url.startsWith('/api/flow') && !url.startsWith('/api/yield') && !url.startsWith('/api/runs') && !url.startsWith('/api/transactions') && !url.startsWith('/api/directory')) {
    return next()
  }
  const send = (code: number, data: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
  }
  try {
    const cfg = serverConfig()
    if (req.method === 'POST' && url === '/api/flow/deposit') {
      const b = await body(req)
      if (typeof b.commitment !== 'string' || !/^[0-9a-f]{64}$/.test(b.commitment)) return send(400, { error: 'commitment' })
      if (typeof b.units !== 'string' || !UNITS.test(b.units)) return send(400, { error: 'units' })
      // With a memo the deposit is a note in the note tree (deposit_note); without, a leaf of the original tree.
      if (b.memo !== undefined && (typeof b.memo !== 'string' || !/^([0-9a-f]{2}){0,256}$/.test(b.memo))) return send(400, { error: 'memo' })
      const commitment = fromHex(b.commitment)
      const memo = typeof b.memo === 'string' ? fromHex(b.memo) : undefined
      const units = BigInt(b.units)
      return send(200, { id: start('deposit', async (job) => depositFlow(cfg, await roles(cfg), commitment, units, recorder(job), memo)) })
    }
    // Who can be paid: each phone registers its profile, name and Boloka ID (notes.ts) when it opens.
    if (url === '/api/directory') {
      if (req.method === 'GET') return send(200, await loadDirectory())
      if (req.method !== 'POST') return send(405, {})
      const b = await body(req)
      if (typeof b.profile !== 'string' || !/^[a-z0-9-]{0,24}$/.test(b.profile)) return send(400, { error: 'profile' })
      if (typeof b.name !== 'string' || b.name.length === 0 || b.name.length > 40) return send(400, { error: 'name' })
      if (typeof b.id !== 'string' || !/^BLK[A-Za-z0-9_-]{86}$/.test(b.id)) return send(400, { error: 'id' })
      const entries = (await loadDirectory()).filter((e) => e.profile !== b.profile)
      entries.push({ profile: b.profile, name: b.name, id: b.id })
      await storage.write(DIRECTORY, JSON.stringify(entries))
      return send(200, { ok: true })
    }
    if (req.method === 'POST' && url === '/api/flow/payout') {
      const b = await body(req)
      if (typeof b.units !== 'string' || !UNITS.test(b.units)) return send(400, { error: 'units' })
      const tx = typeof b.withdrawTx === 'string' && /^[0-9a-f]{64}$/.test(b.withdrawTx) ? b.withdrawTx : null
      const units = BigInt(b.units)
      return send(200, { id: start('payout', async (job) => payoutFlow(cfg, await roles(cfg), units, tx, recorder(job))) })
    }
    if (req.method === 'GET' && url.startsWith('/api/flow/')) {
      const id = url.slice('/api/flow/'.length).replace(/[^a-z0-9]/g, '')
      const job = jobs.get(id) ?? (JSON.parse((await storage.read(`jobs/${id}.json`)) ?? 'null') as Job | null)
      return job ? send(200, job) : send(404, { error: 'no such flow' })
    }
    if (req.method === 'GET' && url === '/api/transactions') {
      return send(200, await ledger.all())
    }
    // A spend the parents' browser submitted itself (a transfer inside the
    // pool runs no server flow): listed on the admin page by its hash.
    if (req.method === 'POST' && url === '/api/transactions/record') {
      const b = await body(req)
      if (typeof b.tx !== 'string' || !/^[0-9a-f]{64}$/.test(b.tx)) return send(400, { error: 'tx' })
      if (b.kind !== 'transfer') return send(400, { error: 'kind' })
      await ledger.append({
        key: 'pool-transfer',
        title: 'Pool spend: transfer between two Boloka accounts inside the pool (zero-knowledge)',
        kind: 'real',
        tx: b.tx,
        note: 'Two nullifiers in, two new notes out; the chain learns neither the amount nor the two owners. Submitted by the sender’s phone.',
        at: new Date().toISOString(),
        flow: 'transfer',
        flowId: b.tx.slice(0, 8),
      })
      return send(200, { ok: true })
    }
    // This device's own transactions, read from the chain (see chainTx.ts).
    if (req.method === 'POST' && url === '/api/transactions/mine') {
      const b = await body(req)
      if (typeof b.account !== 'string' || !/^G[A-Z2-7]{55}$/.test(b.account)) return send(400, { error: 'account' })
      const commitments = Array.isArray(b.commitments) ? b.commitments.filter((c): c is string => typeof c === 'string' && /^[0-9a-f]{64}$/.test(c)) : []
      const r = await roles(cfg)
      return send(200, await forDevice(cfg.poolId, r.sender.publicKey(), b.account, new Set(commitments)))
    }
    if (req.method === 'GET' && url === '/api/yield') {
      const r = await roles(cfg)
      const who = r.yield.publicKey()
      const pos = await yieldLeg.readPosition(cfg, who)
      const principal = await yieldLeg.principal(who)
      // Value this server has no supply history for (a fresh volume) is a
      // baseline, so "earned" counts growth from the first read onwards.
      const base = await yieldLeg.baseline(who, pos.valueUnits, principal)
      const earned = pos.valueUnits - principal - base
      return send(200, {
        account: who,
        bTokens: pos.bTokens,
        bRate: pos.bRate,
        valueUnits: pos.valueUnits,
        principalUnits: principal,
        earnedUnits: earned > 0n ? earned : 0n,
        apr: await yieldLeg.measuredApr(),
      })
    }
    if (req.method === 'GET' && url === '/api/runs/latest') {
      const raw = await storage.read('runs/latest.json')
      if (!raw) return send(404, { error: 'no run yet: npm run demo:e2e' })
      return send(200, JSON.parse(raw))
    }
    return send(404, { error: 'not found' })
  } catch (e) {
    console.error('[api]', e)
    return send(500, { error: e instanceof Error ? e.message : String(e) })
  }
}
