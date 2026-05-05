export interface SavedAddress {
  label: string
  lat: number
  lng: number
}

export interface SavedAddresses {
  from: SavedAddress | null
  to: SavedAddress | null
}

const KEY = 'slippery_addresses'

export function loadAddresses(): SavedAddresses {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { from: null, to: null }
    return JSON.parse(raw) as SavedAddresses
  } catch {
    return { from: null, to: null }
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
