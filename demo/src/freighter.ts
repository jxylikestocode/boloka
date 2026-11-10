// Demo build: a stand-in Freighter that connects as the pool admin and
// "signs" after a moment, as if the person approved in the extension.
import type { Signer } from './chain.ts'
import { ADMIN } from './config.ts'
import { wait } from './mock.ts'

export async function connectFreighter(): Promise<Signer> {
  await wait(900)
  return {
    address: ADMIN,
    async sign(x) {
      await wait(1200)
      return x
    },
  }
}
