// The parents' settings (Settings screen), remembered per browser. Small and
// plain: what the app should ask, where money goes by default, how it shows.
import { useSyncExternalStore } from 'react'
import type { Destination } from './money.ts'

export type Settings = {
  /** Lock the app with PIN / Face ID. */
  pin: boolean
  /** Ask again before every withdrawal. */
  confirmWithdraw: boolean
  /** Where "Withdraw" goes unless changed on the screen. */
  payoutDefault: Destination
  language: 'en' | 'tn'
  notifyArrive: boolean
  notifyMonthly: boolean
  notifyPayout: boolean
  /** Last backup of the account to the trusted people (ISO), or null. */
  backupAt: string | null
  /** Who can restore the account on a new phone. */
  trusted: string[]
}

export const DEFAULTS: Settings = {
  pin: true,
  confirmWithdraw: false,
  payoutDefault: 'bank',
  language: 'en',
  notifyArrive: true,
  notifyMonthly: true,
  notifyPayout: true,
  backupAt: null,
  trusted: ['Thabo (son)', 'Mma Dineo'],
}

const KEY = 'ui.settings'
const listeners = new Set<() => void>()
let cacheRaw: string | null | undefined
let cache: Settings = DEFAULTS

function read(): Settings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // no storage: defaults
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw
    try {
      cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
    } catch {
      cache = DEFAULTS
    }
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>) {
  localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }))
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('storage', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', l)
  }
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS)
}

/** Read once, outside React (e.g. a screen's initial state). */
export const settings = read
