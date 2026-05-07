import type { ElevationGrid } from '../api/elevation'

// Block ramp — terrain uses light→dense fill, route uses blue blocks
const CHARS = [' ', '░', '░', '▒', '▒', '▒', '▓', '▓', '█', '█']
const ROUTE_CHARS = ['░', '▒', '▓', '█']

let currentGrid: ElevationGrid | null = null
let currentRouteCoords: [number, number, number][] | null = null

export function renderAsciiBackground(grid: ElevationGrid, routeCoords: [number, number, number][]): void {
  currentGrid = grid
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
  const { rows, cols, values, bounds } = currentGrid

  // char cell sizing — tighter grid for denser look
  const charW = Math.ceil(vw / cols)
  const charH = Math.ceil(vh / rows)
  const fontSize = charW + 2

  ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`
  ctx.textBaseline = 'top'

  let minElev = Infinity, maxElev = -Infinity
  for (const row of values) {
    for (const v of row) {
      if (v < minElev) minElev = v
      if (v > maxElev) maxElev = v
    }
  }
  const elevRange = maxElev - minElev || 1

  // build a density map: route cells get a count (more = denser char)
  const routeDensity = new Map<string, number>()
  for (const [lng, lat] of currentRouteCoords) {
    const col = Math.round(((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (cols - 1))
    const row = Math.round(((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (rows - 1))
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      const key = `${row},${col}`
      routeDensity.set(key, (routeDensity.get(key) ?? 0) + 1)
    }
  }

  // elevation-based terrain colours (dark mode)
  const terrainColorsDark = [
    'rgba(30,  60,  45,  0.55)',  // low / sea level
    'rgba(35,  70,  50,  0.55)',
    'rgba(50,  80,  55,  0.55)',
    'rgba(60,  90,  55,  0.55)',
    'rgba(80, 100,  55,  0.60)',
    'rgba(100, 110, 60,  0.60)',
    'rgba(120, 115, 70,  0.65)',
    'rgba(140, 120, 80,  0.65)',
    'rgba(160, 140, 110, 0.70)',  // high / peak
    'rgba(190, 170, 150, 0.75)',
  ]
  const terrainColorsLight = [
    'rgba(60,  120, 80,  0.25)',
    'rgba(70,  130, 85,  0.28)',
    'rgba(90,  140, 85,  0.30)',
    'rgba(100, 145, 80,  0.32)',
    'rgba(120, 145, 75,  0.35)',
    'rgba(140, 145, 80,  0.38)',
    'rgba(155, 140, 95,  0.40)',
    'rgba(170, 145, 110, 0.42)',
    'rgba(185, 160, 130, 0.45)',
    'rgba(200, 180, 155, 0.50)',
  ]
  const terrainColors = dark ? terrainColorsDark : terrainColorsLight
  const routeColor = dark ? 'rgba(80, 180, 255, 0.95)' : 'rgba(30, 100, 220, 0.90)'

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`
      const density = routeDensity.get(key) ?? 0
      const elev = values[r][c]
      const band = Math.min(
        CHARS.length - 1,
        Math.floor(((elev - minElev) / elevRange) * CHARS.length),
      )

      if (density > 0) {
        const routeBand = Math.min(ROUTE_CHARS.length - 1, density)
        ctx.fillStyle = routeColor
        ctx.fillText(ROUTE_CHARS[routeBand], c * charW, r * charH)
      } else {
        ctx.fillStyle = terrainColors[band]
        ctx.fillText(CHARS[band], c * charW, r * charH)
      }
    }
  }
}
