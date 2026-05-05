const ORS_KEY = import.meta.env.VITE_ORS_KEY as string

export interface GeocodeSuggestion {
  label: string
  lat: number
  lng: number
}

export interface RouteResult {
  coordinates: [number, number, number][] // [lng, lat, elev]
  surfaceCounts: Record<string, number>
  dominantSurface: string
  distanceKm: number
  durationMin: number
}

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

  return (data.features ?? []).map((f: any) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }))
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteResult> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular/geojson', {
    method: 'POST',
    headers: {
      'Authorization': ORS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      elevation: true,
      extra_info: ['surface'],
    }),
  })
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`)
  const data = await res.json()

  const feature = data.features[0]
  const coordinates: [number, number, number][] = feature.geometry.coordinates
  const summary = feature.properties.summary
  const distanceKm = summary.distance / 1000
  const durationMin = summary.duration / 60

  const surfaceCounts: Record<string, number> = {}
  const SURFACE_NAMES: Record<number, string> = {
    0: 'unknown', 1: 'paved', 2: 'unpaved', 3: 'asphalt', 4: 'concrete',
    5: 'cobblestone', 6: 'metal', 7: 'wood', 8: 'compacted gravel',
    9: 'fine gravel', 10: 'gravel', 11: 'dirt', 12: 'ground',
    13: 'ice', 14: 'salt', 15: 'sand', 16: 'snow', 17: 'mud',
  }

  const surfaceExtra = feature.properties.extras?.surface
  if (surfaceExtra?.values) {
    for (const [start, end, code] of surfaceExtra.values) {
      const name = SURFACE_NAMES[code] ?? 'unknown'
      surfaceCounts[name] = (surfaceCounts[name] ?? 0) + (end - start)
    }
  }

  const dominantSurface = Object.entries(surfaceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'

  return { coordinates, surfaceCounts, dominantSurface, distanceKm, durationMin }
}
