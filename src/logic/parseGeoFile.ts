// [lng, lat] order throughout — matches ORS / GeoJSON convention
import { distanceM } from './geo'

export async function parseGeoFile(file: File): Promise<[number, number][]> {
  const text = await file.text()
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'geojson' || ext === 'json') return parseGeoJSON(text)
  if (ext === 'kml') return parseKML(text)
  return parseGPX(text)
}

function parseGPX(text: string): [number, number][] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const points = Array.from(doc.querySelectorAll('trkpt, rtept'))
  return points.flatMap((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') ?? '')
    const lng = parseFloat(pt.getAttribute('lon') ?? '')
    return isNaN(lat) || isNaN(lng) ? [] : [[lng, lat]]
  })
}

function parseGeoJSON(text: string): [number, number][] {
  const data = JSON.parse(text)
  const features = data.type === 'FeatureCollection'
    ? data.features
    : data.type === 'Feature'
      ? [data]
      : []

  const coords: [number, number][] = []
  for (const feature of features) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === 'LineString') {
      for (const c of geom.coordinates) coords.push([c[0], c[1]])
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates)
        for (const c of line) coords.push([c[0], c[1]])
    }
  }
  return coords
}

function parseKML(text: string): [number, number][] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const coords: [number, number][] = []

  // gx:Track format (Garmin, Google Earth tracks): <gx:coord>lng lat elev</gx:coord>
  const gxCoords = Array.from(doc.getElementsByTagName('*')).filter(
    (el) => el.localName === 'coord' && el.namespaceURI?.includes('google.com/kml/ext'),
  )
  if (gxCoords.length > 0) {
    for (const node of gxCoords) {
      const parts = node.textContent?.trim().split(/\s+/).map(Number) ?? []
      if (parts.length >= 2 && !parts.some(isNaN)) coords.push([parts[0], parts[1]])
    }
    return coords
  }

  // Standard KML: <LineString><coordinates>lng,lat,elev lng,lat,elev ...</coordinates></LineString>
  // Skip <Polygon> and <Point> coordinates — those would corrupt the route
  const lineStrings = Array.from(doc.getElementsByTagName('LineString'))
  const nodes = lineStrings.length > 0
    ? lineStrings.flatMap((ls) => Array.from(ls.getElementsByTagName('coordinates')))
    : Array.from(doc.getElementsByTagName('coordinates'))

  for (const node of nodes) {
    const triplets = node.textContent?.trim().split(/\s+/) ?? []
    for (const triplet of triplets) {
      const parts = triplet.split(',').map(Number)
      if (parts.length >= 2 && !parts.some(isNaN)) coords.push([parts[0], parts[1]])
    }
  }
  return coords
}

export function thinCoordinates(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords

  const cumulative: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceM(coords[i - 1], coords[i]))
  }
  const total = cumulative[cumulative.length - 1]

  const result: [number, number][] = [coords[0]]
  let cursor = 0
  for (let i = 1; i < maxPoints - 1; i++) {
    const target = (i / (maxPoints - 1)) * total
    while (cursor < cumulative.length - 1 && cumulative[cursor + 1] <= target) cursor++
    const next = coords[cursor]
    const prev = result[result.length - 1]
    if (next[0] !== prev[0] || next[1] !== prev[1]) result.push(next)
  }
  const last = coords[coords.length - 1]
  const tail = result[result.length - 1]
  if (last[0] !== tail[0] || last[1] !== tail[1]) result.push(last)
  return result
}

// ~1 waypoint per km, clamped between 10 and 50.
// Short routes need fewer waypoints so ORS can smooth out wiggles; long routes need more to prevent drift.
export function idealWaypointCount(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += distanceM(coords[i - 1], coords[i])
  const km = total / 1000
  return Math.max(10, Math.min(50, Math.round(km)))
}
