const ORS_KEY = import.meta.env.VITE_ORS_KEY as string
// Geocoding endpoints only accept the key as a query param — Authorization header triggers a CORS preflight that ORS rejects.
// fetchRoute uses Authorization because it's a POST and ORS allows it there.

import { distanceM } from '../logic/geo'

// Norway bounding box (generous — includes Svalbard)
const NO_BOUNDS = { minLat: 57.5, maxLat: 81.0, minLng: 4.0, maxLng: 32.0 }

export function isWithinNorway(lat: number, lng: number): boolean {
  return lat >= NO_BOUNDS.minLat && lat <= NO_BOUNDS.maxLat
    && lng >= NO_BOUNDS.minLng && lng <= NO_BOUNDS.maxLng
}

export interface GeocodeSuggestion {
  label: string
  lat: number
  lng: number
}

export interface RouteSegment {
  startIdx: number
  endIdx: number
  surface: string
}

export interface RouteResult {
  coordinates: [number, number, number][] // [lng, lat, elev]
  segments: RouteSegment[]
  surfaceCounts: Record<string, number>
  dominantSurface: string
  distanceKm: number
  durationMin: number
}

export async function geocodeReverse(lat: number, lng: number): Promise<GeocodeSuggestion | null> {
  const url = new URL('https://api.openrouteservice.org/geocode/reverse')
  url.searchParams.set('api_key', ORS_KEY)
  url.searchParams.set('point.lon', String(lng))
  url.searchParams.set('point.lat', String(lat))
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  const f = data.features?.[0]
  if (!f) return null
  return {
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }
}

const NOMINATIM_UA = 'slippery-bergen-pwa/1.0 github.com/kspiteri/slippery'

export async function geocodeAutocomplete(text: string): Promise<GeocodeSuggestion[]> {
  const url = new URL('https://api.openrouteservice.org/geocode/autocomplete')
  url.searchParams.set('api_key', ORS_KEY)
  url.searchParams.set('text', text)
  url.searchParams.set('boundary.country', 'NO')
  url.searchParams.set('focus.point.lon', '5.3221')
  url.searchParams.set('focus.point.lat', '60.3913')
  url.searchParams.set('size', '5')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`)
  const data = await res.json()

  const orsResults: GeocodeSuggestion[] = (data.features ?? []).map((f: any) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }))

  if (orsResults.length >= 2) return orsResults

  // ORS came up short — try Nominatim for POIs, shops, landmarks
  const nominatim = await searchNominatim(text)
  const merged = [...orsResults]
  for (const r of nominatim) {
    const duplicate = merged.some(
      (m) => Math.abs(m.lat - r.lat) < 0.0001 && Math.abs(m.lng - r.lng) < 0.0001,
    )
    if (!duplicate) merged.push(r)
  }
  return merged.slice(0, 5)
}

async function searchNominatim(text: string): Promise<GeocodeSuggestion[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${text} Bergen`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'no')

  try {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': NOMINATIM_UA } })
    if (!res.ok) return []
    const data: any[] = await res.json()
    return data.map((r) => ({
      label: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }))
  } catch {
    return []
  }
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[] = [],
  snapRadiusM?: number,
): Promise<RouteResult> {
  const coords = [
    [from.lng, from.lat],
    ...waypoints.map((w) => [w.lng, w.lat]),
    [to.lng, to.lat],
  ]
  const body = {
    coordinates: coords,
    elevation: true,
    extra_info: ['surface'],
    ...(snapRadiusM != null && { radiuses: coords.map(() => snapRadiusM) }),
  }
  const res = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular/geojson', {
    method: 'POST',
    headers: {
      'Authorization': ORS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`)
  const data = await res.json()

  const feature = data.features[0]
  const coordinates: [number, number, number][] = feature.geometry.coordinates
  const summary = feature.properties.summary
  const distanceKm = summary.distance / 1000
  const durationMin = summary.duration / 60

  const surfaceCounts: Record<string, number> = {}
  const segments: RouteSegment[] = []
  const SURFACE_NAMES: Record<number, string> = {
    0: 'unknown', 1: 'paved', 2: 'unpaved', 3: 'asphalt', 4: 'concrete',
    5: 'cobblestone', 6: 'metal', 7: 'wood', 8: 'compacted gravel',
    9: 'fine gravel', 10: 'gravel', 11: 'dirt', 12: 'ground',
    13: 'ice', 14: 'salt', 15: 'sand', 16: 'snow', 17: 'mud',
  }

  const surfaceExtra = feature.properties.extras?.surface
  if (surfaceExtra?.values) {
    for (const [startIdx, endIdx, code] of surfaceExtra.values) {
      const name = SURFACE_NAMES[code] ?? 'unknown'
      segments.push({ startIdx, endIdx, surface: name })
      // sum actual segment distances (metres) between coordinate points
      let dist = 0
      for (let i = startIdx; i < endIdx && i + 1 < coordinates.length; i++) {
        dist += distanceM(coordinates[i], coordinates[i + 1])
      }
      surfaceCounts[name] = (surfaceCounts[name] ?? 0) + dist
    }
  }

  const dominantSurface = Object.entries(surfaceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'

  return { coordinates, segments, surfaceCounts, dominantSurface, distanceKm, durationMin }
}
