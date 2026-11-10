// Which arrivals the receiver has already opened, so new ones
// show as a notification.
const KEY = 'demo.seen'

export const seen = (): Set<string> =>
  new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])

export function markSeen(id: string) {
  const s = seen()
  if (s.has(id)) return
  s.add(id)
  localStorage.setItem(KEY, JSON.stringify([...s]))
}
