// Demo build: mirrors the demo's saved state (localStorage keys starting
// "savings." or "demo.") through the dev server, so Boloka, MoneyGram and the
// bank stay in step even when installed as separate home-screen apps (each
// gets its own storage on iPhone) or opened on different devices.
const SHARED = /^(savings|demo)\./
const setItem = Storage.prototype.setItem
const removeItem = Storage.prototype.removeItem
let version = -1
let pending = 0

function send(key: string, value: string | null) {
  pending++
  fetch('/api/state', {
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
Storage.prototype.removeItem = function (key: string) {
  removeItem.call(this, key)
  if (this === localStorage && SHARED.test(key)) send(key, null)
}

/** Replaces local shared keys with the server's; tells the app if anything changed. */
async function pull() {
  if (pending) return
  const r = await fetch('/api/state', { cache: 'no-store' })
  const s = (await r.json()) as { version: number; items: Record<string, string> }
  if (pending || s.version === version) return
  version = s.version
  let changed = false
  for (const k of Object.keys(localStorage)) {
    if (SHARED.test(k) && !(k in s.items)) {
      removeItem.call(localStorage, k)
      changed = true
    }
  }
  for (const [k, v] of Object.entries(s.items)) {
    if (localStorage.getItem(k) !== v) {
      setItem.call(localStorage, k, v)
      changed = true
    }
  }
  // Existing screens already refresh on 'storage' (other-tab changes).
  if (changed) window.dispatchEvent(new StorageEvent('storage'))
}

/** Loads the shared state once, then keeps polling for other apps' changes. */
export async function startSync() {
  try {
    await pull()
  } catch {
    // Offline: run on whatever this browser already has.
  }
  setInterval(() => pull().catch(() => {}), 1500)
}
