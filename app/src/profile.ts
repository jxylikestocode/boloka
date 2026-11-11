// Which Boloka account this window is. The main account ("Mom") lives at the
// usual paths; a second phone on the same origin runs the same screens under
// /as/<profile>/… with its own keys and records, so the demo can show money
// sent from one Boloka to another. The profile is fixed at load from the URL.
export const PROFILE: string = (() => {
  if (typeof location === 'undefined') return ''
  const m = location.pathname.match(/^\/as\/([a-z0-9-]+)(?=\/|$)/)
  return m?.[1] ?? ''
})()

/** The router's basename: every in-app link stays on this phone. */
export const BASENAME = PROFILE ? `/as/${PROFILE}` : '/'

/**
 * A saved-state key for this profile. The main account's keys are unchanged
 * ("savings.notes"), so nothing already saved moves; a profile's become
 * "savings.<profile>.notes".
 */
export const scoped = (key: string) => (PROFILE ? key.replace(/^savings\./, `savings.${PROFILE}.`) : key)

export type Person = { name: string; initial: string; phone: string; town: string; who: string }

/** The people in the demo, by profile. */
export const PEOPLE: Record<string, Person> = {
  '': { name: 'Mom', initial: 'M', phone: '+267 71 234 567', town: 'Gaborone', who: "Kate's mother" },
  neo: { name: 'Neo', initial: 'N', phone: '+267 72 456 789', town: 'Francistown', who: "Kate's sister, at university" },
}

export const ME: Person = PEOPLE[PROFILE] ?? {
  name: PROFILE,
  initial: PROFILE.slice(0, 1).toUpperCase(),
  phone: '',
  town: '',
  who: '',
}
