// Vercel: every /api/* request lands here and is served by the same code as
// the dev and production servers. A flow keeps running after its response
// (waitUntil in server/routes.ts), so maxDuration covers the whole transfer.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../server/routes.ts'
import { handleState } from '../server/state.ts'

export const config = { maxDuration: 300 }

export default async function api(req: IncomingMessage, res: ServerResponse) {
  if (await handleState(req, res)) return
  await handle(req, res, () => {
    res.statusCode = 404
    res.end('not found')
  })
}
