// Dev-server API for the apps (registered by vite.config.ts):
//   POST /api/flow/deposit {commitment, units}      → {id}   MoneyGram → pool
//   POST /api/flow/payout  {units, withdrawTx}       → {id}   pool → anchor
//   GET  /api/flow/<id>                              → {status, steps, error}
//   GET  /api/yield                                  → the real Blend mirror position
//   GET  /api/runs/latest                            → latest demo:e2e run
// Flows run one at a time: they share the role accounts' sequence numbers.
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { roles } from './accounts.ts'
import { serverConfig } from './config.ts'
import { depositFlow, payoutFlow, type Step } from './flows.ts'
import { fromHex } from '../src/proof.ts'
import * as yieldLeg from './yieldLeg.ts'
import * as ledger from './ledger.ts'

type Job = { id: string; flow: 'deposit' | 'payout'; status: 'running' | 'done' | 'error'; steps: Step[]; error?: string }
const jobs = new Map<string, Job>()
let queue: Promise<unknown> = Promise.resolve()

function start(flow: Job['flow'], run: (job: Job) => Promise<unknown>): string {
  const id = Math.random().toString(36).slice(2)
  const job: Job = { id, flow, status: 'running', steps: [] }
  jobs.set(id, job)
  const next = queue.then(() =>
    run(job).then(
      () => (job.status = 'done'),
      (e: unknown) => {
        console.error('[flow]', e)
        job.status = 'error'
        job.error = e instanceof Error ? e.message : String(e)
      },
    ),
  )
  queue = next.catch(() => {})
  return id
}

const recorder = (job: Job) => ({
  step: (s: Omit<Step, 'at'>) => {
    const step = { ...s, at: new Date().toISOString() }
    job.steps.push(step)
    ledger.append({ ...step, flow: job.flow, flowId: job.id })
  },
  log: (m: string, d?: Record<string, unknown>) => console.log('[flow]', m, d ? JSON.stringify(d) : ''),
})

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

export async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? ''
  if (!url.startsWith('/api/flow') && !url.startsWith('/api/yield') && !url.startsWith('/api/runs') && url !== '/api/transactions') {
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
      const commitment = fromHex(b.commitment)
      const units = BigInt(b.units)
      return send(200, { id: start('deposit', async (job) => depositFlow(cfg, await roles(cfg), commitment, units, recorder(job))) })
    }
    if (req.method === 'POST' && url === '/api/flow/payout') {
      const b = await body(req)
      if (typeof b.units !== 'string' || !UNITS.test(b.units)) return send(400, { error: 'units' })
      const tx = typeof b.withdrawTx === 'string' && /^[0-9a-f]{64}$/.test(b.withdrawTx) ? b.withdrawTx : null
      const units = BigInt(b.units)
      return send(200, { id: start('payout', async (job) => payoutFlow(cfg, await roles(cfg), units, tx, recorder(job))) })
    }
    if (req.method === 'GET' && url.startsWith('/api/flow/')) {
      const job = jobs.get(url.slice('/api/flow/'.length))
      return job ? send(200, job) : send(404, { error: 'no such flow' })
    }
    if (req.method === 'GET' && url === '/api/transactions') {
      return send(200, ledger.all())
    }
    if (req.method === 'GET' && url === '/api/yield') {
      const r = await roles(cfg)
      const who = r.yield.publicKey()
      const pos = await yieldLeg.readPosition(cfg, who)
      const principal = yieldLeg.principal(who)
      return send(200, {
        account: who,
        bTokens: pos.bTokens,
        bRate: pos.bRate,
        valueUnits: pos.valueUnits,
        principalUnits: principal,
        earnedUnits: pos.valueUnits > principal ? pos.valueUnits - principal : 0n,
        apr: yieldLeg.measuredApr(),
      })
    }
    if (req.method === 'GET' && url === '/api/runs/latest') {
      const f = new URL('../.runs/latest.json', import.meta.url)
      if (!existsSync(f)) return send(404, { error: 'no run yet: npm run demo:e2e' })
      return send(200, JSON.parse(readFileSync(f, 'utf8')))
    }
    return send(404, { error: 'not found' })
  } catch (e) {
    console.error('[api]', e)
    return send(500, { error: e instanceof Error ? e.message : String(e) })
  }
}
