// Shares this app's saved state (localStorage keys starting "savings." or
// "demo.") with the other apps through the dev server. Boloka, MoneyGram and
// the bank run on separate ports (separate storage), and on iPhone each
// home-screen app has its own storage too; without this, Boloka would never
// learn the secret of a deposit MoneyGram made for it.
//
// It never deletes: the deposit and withdrawal lists are merged by id (they
// hold the secrets that open the deposits, so losing one loses that money),
// and any key only this browser has is uploaded rather than dropped.
const SHARED = /^(savings|demo)\./
const LISTS = new Set(['savings.deposits', 'savings.withdrawals'])
const setItem = Storage.prototype.setItem
let version = -1
let pending = 0

function send(key: string, value: string) {
  pending++
  return fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
    .then((r) => r.json())
    .then((r: { version?: number }) => {
      if (typeof r.version === 'number') version = Math.max(version, r.version)
    })
    .catch(() => {})
    .finally(() => pending--)
}

Storage.prototype.setItem = function (key: string, value: string) {
  setItem.call(this, key, value)
  if (this === localStorage && SHARED.test(key)) send(key, String(value))
}

/** Union of two JSON lists of {id} records, keeping order of first sight. */
function mergeLists(a: string | null, b: string | null): string {
  const out = new Map<string, unknown>()
  for (const raw of [a, b]) {
    try {
      for (const r of JSON.parse(raw ?? '[]') as { id: string }[]) {
        if (r && typeof r.id === 'string') out.set(r.id, { ...(out.get(r.id) as object | undefined), ...r })
      }
    } catch {
      // ignore an unreadable list; the other side still counts
    }
  }
  return JSON.stringify([...out.values()])
}

async function pull() {
  if (pending) return
  const r = await fetch('/api/state', { cache: 'no-store' })
  const s = (await r.json()) as { version: number; items: Record<string, string> }
  if (pending || s.version === version) return
  version = s.version
  let changed = false
  const uploads: Promise<unknown>[] = []
  const keys = new Set([...Object.keys(s.items), ...Object.keys(localStorage).filter((k) => SHARED.test(k))])
  for (const k of keys) {
    const local = localStorage.getItem(k)
    const remote = k in s.items ? s.items[k] : null
    let next: string | null
    if (LISTS.has(k)) {
      next = mergeLists(local, remote)
      if (next !== remote) uploads.push(send(k, next))
    } else if (remote !== null) {
      next = remote
    } else {
      // Only this browser has it: share it, keep it.
      uploads.push(send(k, local!))
      next = local
    }
    if (next !== null && next !== local) {
      setItem.call(localStorage, k, next)
      changed = true
    }
  }
  await Promise.all(uploads)
  if (changed) window.dispatchEvent(new StorageEvent('storage'))
}

/** Loads the shared state once, then keeps polling for other apps' changes. */
export async function startSync() {
  try {
    await pull()
  } catch {
    // Dev server unreachable: run on what this browser has.
  }
  setInterval(() => pull().catch(() => {}), 1500)
}
