import type { Results } from './App'

const CACHE_KEY = 'slippery_route_cache_v2'
const TTL_MS = 15 * 60 * 1000

interface AddressLike {
  lat: number
  lng: number
}

interface CacheEntry {
  results: Results
  ts: number
}

type CacheStore = Record<string, CacheEntry>

export interface CachedResults {
  results: Results
  ts: number
}

function routeKey(from: AddressLike, to: AddressLike, waypoints: AddressLike[]): string {
  const round = (n: number) => n.toFixed(5)
  return JSON.stringify({
    from: [round(from.lat), round(from.lng)],
    to: [round(to.lat), round(to.lng)],
    waypoints: waypoints.map((w) => [round(w.lat), round(w.lng)]),
  })
}

function readStore(): CacheStore {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheStore) : {}
  } catch {
    return {}
  }
}

export function getCached(
  from: AddressLike,
  to: AddressLike,
  waypoints: AddressLike[],
): CachedResults | null {
  const store = readStore()
  const entry = store[routeKey(from, to, waypoints)]
  if (!entry) return null
  if (Date.now() - entry.ts > TTL_MS) return null
  return entry
}

export function setCached(
  from: AddressLike,
  to: AddressLike,
  waypoints: AddressLike[],
  results: Results,
): number {
  const ts = Date.now()
  try {
    const store = readStore()
    store[routeKey(from, to, waypoints)] = { results, ts }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    // quota or parse error — ignore
  }
  return ts
}
