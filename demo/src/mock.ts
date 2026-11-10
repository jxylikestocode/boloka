// Demo build: everything that would touch the network is simulated here,
// with short delays so the screens show their busy states on video.
import { toHex, randomBytes32 } from './proof.ts'

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A believable 64-hex transaction hash. */
export const fakeHash = () => toHex(randomBytes32())

/** Clears all demo state: savings, schedule, pool funds. */
export function resetDemo() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('savings.') || k.startsWith('demo.')) localStorage.removeItem(k)
  }
}
