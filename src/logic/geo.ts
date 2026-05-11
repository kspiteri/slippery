// Equirectangular distance — fast and accurate enough for ride-length distances.
// Accepts [lng, lat] or [lng, lat, elev] tuples.
export function distanceM(a: readonly [number, number, ...number[]], b: readonly [number, number, ...number[]]): number {
  const R = 6371000
  const dLat = (b[1] - a[1]) * Math.PI / 180
  const dLng = (b[0] - a[0]) * Math.PI / 180
  const lat = (a[1] + b[1]) / 2 * Math.PI / 180
  return Math.sqrt(dLat * dLat + (dLng * Math.cos(lat)) ** 2) * R
}
