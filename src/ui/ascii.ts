import type { ElevationGrid } from '../api/elevation'

const CHARS = ['░', '░', '▒', '▒', '▒', '▓', '▓', '█', '█']

const TERRAIN_DARK = [
  'rgba(0,   60,  80,  0.70)',  // sea / very low
  'rgba(0,   75,  70,  0.70)',  // coastal
  'rgba(20,  90,  50,  0.72)',  // low ground
  'rgba(30, 110,  45,  0.74)',
  'rgba(40, 130,  40,  0.76)',
  'rgba(55, 145,  35,  0.78)',
  'rgba(75, 155,  30,  0.80)',
  'rgba(100,160,  25,  0.82)',
  'rgba(130,165,  20,  0.84)',
  'rgba(165,175,  15,  0.86)',  // high / exposed ridge
]
const TERRAIN_LIGHT = [
  'rgba(0,   80, 110,  0.45)',  // sea / very low
  'rgba(0,  100,  90,  0.45)',  // coastal
  'rgba(30, 120,  60,  0.48)',  // low ground
  'rgba(40, 140,  50,  0.50)',
  'rgba(55, 158,  40,  0.52)',
  'rgba(75, 168,  32,  0.54)',
  'rgba(95, 175,  25,  0.56)',
  'rgba(120,178,  20,  0.58)',
  'rgba(150,180,  15,  0.60)',
  'rgba(180,185,  10,  0.62)',  // high / exposed ridge
]

let currentGrid: ElevationGrid | null = null
let currentRouteCoords: [number, number, number][] | null = null
// Cached per-grid stats — recomputed only when the grid changes
let cachedElevMin = 0
let cachedElevMax = 0
let cachedElevRange = 1

let resizeInitialised = false

export function renderAsciiBackground(
  grid: ElevationGrid,
  routeCoords: [number, number, number][],
): void {
  if (grid !== currentGrid) {
    let min = Infinity, max = -Infinity
    for (const row of grid.values) {
      for (const v of row) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    cachedElevMin = min
    cachedElevMax = max
    cachedElevRange = max - min || 1
    currentGrid = grid
  }
  currentRouteCoords = routeCoords
  draw()
}

export function clearAsciiBackground(): void {
  currentGrid = null
  currentRouteCoords = null
  const canvas = document.getElementById('ascii-bg') as HTMLCanvasElement | null
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }
}

export function initAsciiResize(): void {
  if (resizeInitialised) return
  resizeInitialised = true
  window.addEventListener('resize', () => {
    if (currentGrid && currentRouteCoords) draw()
  })
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light'
}

function draw(): void {
  if (!currentGrid || !currentRouteCoords) return

  const canvas = document.getElementById('ascii-bg') as HTMLCanvasElement
  const vw = window.innerWidth
  const vh = window.innerHeight
  canvas.width = vw
  canvas.height = vh

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, vw, vh)

  const dark = isDark()
  const { values, bounds } = currentGrid
  const { minLat, maxLat, minLng, maxLng } = bounds
  const { rows: gridRows, cols: gridCols } = currentGrid

  const fontSize = 11
  const cols = Math.floor(vw / (fontSize * 0.62))
  const rows = Math.floor(vh / (fontSize * 1.2))
  const charW = vw / cols
  const charH = vh / rows

  ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`
  ctx.textBaseline = 'top'

  // Pre-compute elevation band for every display cell
  const bands = new Uint8Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    const lat = maxLat - (r / (rows - 1)) * (maxLat - minLat)
    const fr = Math.max(0, Math.min(gridRows - 1, Math.round(((maxLat - lat) / (maxLat - minLat)) * (gridRows - 1))))
    for (let c = 0; c < cols; c++) {
      const lng = minLng + (c / (cols - 1)) * (maxLng - minLng)
      const fc = Math.max(0, Math.min(gridCols - 1, Math.round(((lng - minLng) / (maxLng - minLng)) * (gridCols - 1))))
      const elev = values[fr][fc] ?? 0
      bands[r * cols + c] = Math.min(CHARS.length - 1, Math.floor(((elev - cachedElevMin) / cachedElevRange) * CHARS.length))
    }
  }

  const terrainColors = dark ? TERRAIN_DARK : TERRAIN_LIGHT

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = r * cols + c
      ctx.fillStyle = terrainColors[bands[key]]
      ctx.fillText(CHARS[bands[key]], c * charW, r * charH)
    }
  }

  // Route sparkline — geographic polyline over the terrain
  const routeColor = dark ? 'rgba(255, 140, 0, 0.90)' : 'rgba(200, 90, 0, 0.90)'
  ctx.strokeStyle = routeColor
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  let started = false
  for (const [lng, lat] of currentRouteCoords) {
    const x = ((lng - minLng) / (maxLng - minLng)) * vw
    const y = ((maxLat - lat) / (maxLat - minLat)) * vh
    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}
