import type { RouteResult } from './api/ors'

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

export interface SavedRoute {
  name: string
  from: SavedAddress
  to: SavedAddress
  waypoints: SavedAddress[]
  route: RouteResult
  routeCachedAt: number
}

export const MAX_SAVED_ROUTES = 5
const SAVED_ROUTES_KEY = 'slippery_saved_routes'

export function loadSavedRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(SAVED_ROUTES_KEY)
    return raw ? (JSON.parse(raw) as SavedRoute[]) : []
  } catch {
    return []
  }
}

export function addSavedRoute(route: SavedRoute): SavedRoute[] | 'limit' | 'error' {
  const current = loadSavedRoutes()
  if (current.length >= MAX_SAVED_ROUTES) return 'limit'
  const next = [...current, route]
  try {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(next))
  } catch {
    return 'error'
  }
  return next
}

export function deleteSavedRoute(index: number): SavedRoute[] {
  const next = loadSavedRoutes().filter((_, i) => i !== index)
  localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(next))
  return next
}

export function clearUserData(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(TYRE_KEY)
  localStorage.removeItem(SAVED_ROUTES_KEY)
  localStorage.removeItem('slippery_focus_mode')
}
