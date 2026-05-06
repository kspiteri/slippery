export interface SavedAddress {
  label: string
  lat: number
  lng: number
}

export interface SavedAddresses {
  from: SavedAddress | null
  to: SavedAddress | null
  waypoints: SavedAddress[]
}

const KEY = 'slippery_addresses'

export function loadAddresses(): SavedAddresses {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { from: null, to: null, waypoints: [] }
    const parsed = JSON.parse(raw) as Partial<SavedAddresses>
    return {
      from: parsed.from ?? null,
      to: parsed.to ?? null,
      waypoints: parsed.waypoints ?? [],
    }
  } catch {
    return { from: null, to: null, waypoints: [] }
  }
}

export function saveAddress(field: 'from' | 'to', address: SavedAddress): void {
  const current = loadAddresses()
  current[field] = address
  localStorage.setItem(KEY, JSON.stringify(current))
}

export function clearAddress(field: 'from' | 'to'): void {
  const current = loadAddresses()
  current[field] = null
  localStorage.setItem(KEY, JSON.stringify(current))
}

export function saveWaypoints(waypoints: SavedAddress[]): void {
  const current = loadAddresses()
  current.waypoints = waypoints
  localStorage.setItem(KEY, JSON.stringify(current))
}

export type TyrePref = 'normal' | 'studded'
const TYRE_KEY = 'slippery_tyres'

export function loadTyrePref(): TyrePref | null {
  const raw = localStorage.getItem(TYRE_KEY)
  return raw === 'normal' || raw === 'studded' ? raw : null
}

export function saveTyrePref(pref: TyrePref): void {
  localStorage.setItem(TYRE_KEY, pref)
}
