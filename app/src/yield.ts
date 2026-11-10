// The real Blend position behind the parents' "Growing" figure (see
// server/yieldLeg.ts: a mirror position in Blend's testnet pool).
import { useEffect, useState } from 'react'

export type YieldInfo = { account: string; apr: number | null; valueUnits: string; earnedUnits: string }

export function useYield(): YieldInfo | null {
  const [info, setInfo] = useState<YieldInfo | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch('/api/yield')
        .then((r) => (r.ok ? r.json() : null))
        .then((y) => live && y && setInfo(y as YieldInfo))
        .catch(() => {})
    load()
    const t = setInterval(load, 30_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return info
}
