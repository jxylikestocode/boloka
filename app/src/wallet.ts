// This phone's note keys (notes.ts): the spending secret, made on first use
// and kept with the other saved state, and the Boloka ID others pay to. The
// ID is also registered in the dev server's directory so the other apps in
// the demo (MoneyGram, the other phone) can find it by profile.
import { decodeId, encodeId, fromBytes, keysFrom, randomField, recipientOf, toBytes32, toHex, type Keys, type Recipient } from './notes.ts'
import { ME, PROFILE, scoped } from './profile.ts'

const SECRET = scoped('savings.noteSecret')

let cached: Keys | null = null

/** The keys behind this phone's notes. */
export function noteKeys(): Keys {
  if (cached) return cached
  const saved = localStorage.getItem(SECRET)
  let sk: bigint
  if (saved && /^[0-9a-f]{64}$/.test(saved)) {
    sk = fromBytes(Uint8Array.from(saved.match(/../g)!, (x) => parseInt(x, 16)))
  } else {
    sk = randomField()
    localStorage.setItem(SECRET, toHex(toBytes32(sk)))
  }
  cached = keysFrom(sk)
  return cached
}

export const myRecipient = (): Recipient => recipientOf(noteKeys())
export const myId = () => encodeId(myRecipient())

export type DirectoryEntry = { profile: string; name: string; id: string }

/** The accounts the dev server knows, by profile; empty if it is unreachable. */
export async function directory(): Promise<DirectoryEntry[]> {
  try {
    const r = await fetch('/api/directory', { cache: 'no-store' })
    if (!r.ok) return []
    return (await r.json()) as DirectoryEntry[]
  } catch {
    return []
  }
}

/** Tells the dev server this phone's ID (idempotent; best effort). */
export async function register() {
  try {
    await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE, name: ME.name, id: myId() } satisfies DirectoryEntry),
    })
  } catch {
    // no server: others cannot look this phone up, but it works on its own
  }
}

/** Whom to pay for a profile: this phone's own keys, or the directory's entry. */
export async function recipientFor(profile: string): Promise<{ name: string; recipient: Recipient } | null> {
  if (profile === PROFILE) return { name: ME.name, recipient: myRecipient() }
  const hit = (await directory()).find((e) => e.profile === profile)
  const recipient = hit && decodeId(hit.id)
  return hit && recipient ? { name: hit.name, recipient } : null
}
