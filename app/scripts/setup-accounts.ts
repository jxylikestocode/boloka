// Creates (once) the server-side role accounts and prints the payout address.
// Called by ../deploy.sh after it has written app/.env.
import { roles } from '../server/accounts.ts'
import { serverConfig } from '../server/config.ts'

const r = await roles(serverConfig())
console.error(`sender ${r.sender.publicKey()}\npayout ${r.payout.publicKey()}\nyield  ${r.yield.publicKey()}`)
console.log(r.payout.publicKey())
