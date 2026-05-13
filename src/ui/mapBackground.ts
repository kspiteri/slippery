// Kartverket WMS — label-free topo layers (hillshade + land cover + contours + water)
const WMS_BASE = 'https://wms.geonorge.no/skwms1/wms.topo'
const WMS_LAYERS = 'fjellskygge,kd_arealdekkeflate,kd_hoydekurver,kd_vannflate'

// Fixed half-span for each sample bbox — keeps detail regardless of route length
const BBOX_HALF_LAT = 0.35
const BBOX_HALF_LNG = 0.50

const ROTATE_INTERVAL_MS = 10_000
const FADE_DURATION_MS   = 2_000

// Seeded grain canvas — built once, reused as a pattern every frame
const GRAIN_SIZE = 256
const _grainCanvas = document.createElement('canvas')
_grainCanvas.width = GRAIN_SIZE
_grainCanvas.height = GRAIN_SIZE
const _grainCtx = _grainCanvas.getContext('2d')!
const _grainData = _grainCtx.createImageData(GRAIN_SIZE, GRAIN_SIZE)
for (let i = 0; i < GRAIN_SIZE * GRAIN_SIZE; i++) {
  const v = Math.random() * 255
  _grainData.data[i * 4]     = v
  _grainData.data[i * 4 + 1] = v
  _grainData.data[i * 4 + 2] = v
  _grainData.data[i * 4 + 3] = 255
}
_grainCtx.putImageData(_grainData, 0, 0)

let cachedImages: HTMLImageElement[] = []
let currentIdx  = 0
let rotateTimer: ReturnType<typeof setTimeout> | null = null
let fadeRaf: number | null = null
let resizeInitialised = false

// --- helpers -----------------------------------------------------------------

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light'
}

function samplePoints(coords: [number, number, number][], n: number): Array<[number, number]> {
  if (coords.length === 0) return []
  if (coords.length === 1 || n === 1) return [[coords[0][1], coords[0][0]]]
  const step = (coords.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => {
    const c = coords[Math.round(i * step)]
    return [c[1], c[0]] // [lat, lng]
  })
}

async function fetchImageAt(lat: number, lng: number): Promise<HTMLImageElement> {
  const url = `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&FORMAT=image%2Fpng&LAYERS=${WMS_LAYERS}&CRS=EPSG%3A4326&STYLES=` +
    `&WIDTH=1024&HEIGHT=1024` +
    `&BBOX=${lat - BBOX_HALF_LAT},${lng - BBOX_HALF_LNG},${lat + BBOX_HALF_LAT},${lng + BBOX_HALF_LNG}`

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// --- drawing -----------------------------------------------------------------

function applyEffects(ctx: CanvasRenderingContext2D, vw: number, vh: number, dark: boolean): void {
  // Colour wash
  ctx.fillStyle = dark ? 'rgba(10, 20, 35, 0.45)' : 'rgba(245, 240, 230, 0.35)'
  ctx.fillRect(0, 0, vw, vh)

  // Vignette
  const vig = ctx.createRadialGradient(
    vw * 0.5, vh * 0.5, Math.min(vw, vh) * 0.25,
    vw * 0.5, vh * 0.5, Math.max(vw, vh) * 0.85,
  )
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, dark ? 'rgba(0,0,0,0.70)' : 'rgba(200,195,185,0.55)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, vw, vh)

  // Film grain — reuse pre-built canvas
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = dark ? 0.08 : 0.05
  ctx.fillStyle = ctx.createPattern(_grainCanvas, 'repeat')!
  ctx.fillRect(0, 0, vw, vh)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function drawBlended(imgA: HTMLImageElement, imgB: HTMLImageElement, t: number, dark: boolean): void {
  const canvas = document.getElementById('map-bg') as HTMLCanvasElement
  const vw = canvas.width
  const vh = canvas.height
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, vw, vh)

  const mapAlpha = dark ? 0.55 : 0.45
  ctx.filter = 'blur(3px)'
  ctx.globalAlpha = (1 - t) * mapAlpha
  ctx.drawImage(imgA, 0, 0, vw, vh)
  ctx.globalAlpha = t * mapAlpha
  ctx.drawImage(imgB, 0, 0, vw, vh)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  applyEffects(ctx, vw, vh, dark)
}

function drawSingle(img: HTMLImageElement): void {
  const canvas = document.getElementById('map-bg') as HTMLCanvasElement
  const vw = canvas.width
  const vh = canvas.height
  const ctx = canvas.getContext('2d')!
  const dark = isDark()

  ctx.clearRect(0, 0, vw, vh)
  ctx.filter = 'blur(3px)'
  ctx.globalAlpha = dark ? 0.55 : 0.45
  ctx.drawImage(img, 0, 0, vw, vh)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  applyEffects(ctx, vw, vh, dark)
}

function crossfadeTo(nextIdx: number): void {
  if (fadeRaf !== null) cancelAnimationFrame(fadeRaf)
  const imgA = cachedImages[currentIdx]
  const imgB = cachedImages[nextIdx]
  const dark  = isDark()  // captured once — stable for the whole transition
  const start = performance.now()

  function tick(now: number) {
    const t = Math.min(1, (now - start) / FADE_DURATION_MS)
    drawBlended(imgA, imgB, t, dark)
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick)
    } else {
      fadeRaf = null
      currentIdx = nextIdx
      scheduleNext()
    }
  }
  fadeRaf = requestAnimationFrame(tick)
}

function scheduleNext(): void {
  if (rotateTimer !== null) clearTimeout(rotateTimer)
  if (cachedImages.length < 2) return
  rotateTimer = setTimeout(() => {
    const nextIdx = (currentIdx + 1) % cachedImages.length
    crossfadeTo(nextIdx)
  }, ROTATE_INTERVAL_MS)
}

function resizeCanvas(): void {
  const canvas = document.getElementById('map-bg') as HTMLCanvasElement | null
  if (!canvas) return
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
}

// --- public API --------------------------------------------------------------

export async function renderMapBackground(coords: [number, number, number][], distanceKm: number): Promise<void> {
  // Cancel any in-flight animation from previous route
  if (rotateTimer !== null) { clearTimeout(rotateTimer); rotateTimer = null }
  if (fadeRaf    !== null) { cancelAnimationFrame(fadeRaf); fadeRaf = null }
  cachedImages = []
  currentIdx   = 0

  resizeCanvas()

  const sampleCount = distanceKm < 10 ? 1 : distanceKm < 20 ? 2 : distanceKm < 30 ? 3 : 4
  const points = samplePoints(coords, sampleCount)
  const results = await Promise.allSettled(points.map(([lat, lng]) => fetchImageAt(lat, lng)))
  cachedImages = results
    .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
    .map(r => r.value)
  if (cachedImages.length === 0) return

  drawSingle(cachedImages[0])
  scheduleNext()
}

export function clearMapBackground(): void {
  if (rotateTimer !== null) { clearTimeout(rotateTimer); rotateTimer = null }
  if (fadeRaf    !== null) { cancelAnimationFrame(fadeRaf); fadeRaf = null }
  cachedImages = []
  currentIdx   = 0

  const canvas = document.getElementById('map-bg') as HTMLCanvasElement | null
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }
}

export function initMapResize(): void {
  if (resizeInitialised) return
  resizeInitialised = true
  window.addEventListener('resize', () => {
    resizeCanvas()
    if (cachedImages.length > 0) drawSingle(cachedImages[currentIdx])
  })
}
