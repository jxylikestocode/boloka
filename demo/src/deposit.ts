// Demo build: a transfer lands in savings after a short pause.
import { wait } from './mock.ts'
import { monthOf, randomBytes32, toHex } from './proof.ts'
import * as store from './store.ts'

export async function depositForReceiver(
  _payer: unknown,
  units: bigint,
  from: { sender: string; via: string },
): Promise<store.DepositRecord> {
  await wait(1500)
  const id = toHex(randomBytes32())
  const rec: store.DepositRecord = {
    id,
    secret: toHex(randomBytes32()),
    amount: units.toString(),
    month: monthOf(),
    commitment: id,
    sender: from.sender,
    via: from.via,
    date: new Date().toISOString(),
  }
  store.addDeposit(rec)
  return rec
}
