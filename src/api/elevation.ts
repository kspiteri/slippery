export interface ElevationGrid {
  rows: number
  cols: number
  values: number[][] // [row][col], elevation in metres
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
}

export function buildElevationGrid(
  coords: [number, number, number][],
  cols = 60,
  rows = 28,
): ElevationGrid {
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])

  const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.25 || 0.01
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.35 || 0.01
  const bounds = {
    minLng: Math.min(...lngs) - padLng,
    maxLng: Math.max(...lngs) + padLng,
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
  }

  // For each grid cell, find the nearest route coordinate and use its elevation
  const values: number[][] = []
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const gridLat = bounds.maxLat - (r / (rows - 1)) * (bounds.maxLat - bounds.minLat)
      const gridLng = bounds.minLng + (c / (cols - 1)) * (bounds.maxLng - bounds.minLng)
      row.push(nearestElevation(coords, gridLat, gridLng))
    }
    values.push(row)
  }

  return { rows, cols, values, bounds }
}

function nearestElevation(
  coords: [number, number, number][],
  lat: number,
  lng: number,
): number {
  const cosLat = Math.cos(lat * Math.PI / 180)
  let best = coords[0]
  let bestDist = Infinity
  for (const c of coords) {
    const dLat = c[1] - lat
    const dLng = (c[0] - lng) * cosLat
    const d = dLat * dLat + dLng * dLng
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best[2] ?? 0
}
