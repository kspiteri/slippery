import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import i18n from './i18n'
import {
  loadAddresses, saveAddress, saveWaypoints,
  loadTyrePref, saveTyrePref, type TyrePref,
  loadSavedRoutes, addSavedRoute, deleteSavedRoute, clearUserData,
  loadFontScale, saveFontScale, fontScaleToPercent, clampFontScale,
  type FontScale,
  type SavedRoute, MAX_SAVED_ROUTES,
} from './state'
import { fetchRoute, geocodeReverse, type RouteResult, type RouteSegment } from './api/ors'
import { fetchWeatherAll, type WeatherData, type AlertAwareness } from './api/met'
import { buildElevationGrid } from './api/elevation'
import { calculateSlipperiness, type SlippinessResult } from './logic/slipperiness'
import { renderAsciiBackground, clearAsciiBackground } from './ui/ascii'
import { AddressForm, type Waypoint } from './ui/AddressForm'
import { Verdict } from './ui/Verdict'
import { AppHeader } from './ui/AppHeader'
import { TyrePrompt } from './ui/TyrePrompt'
import { Button } from './ui/primitives/Button'
import { SavedRoutesList } from './ui/SavedRoutesList'
import { AlertTriangle } from 'lucide-react'
import { withRetry } from './lib/retry'
import { getCached, setCached } from './cache'
import { needsMultiPointSampling, sampleCoordinates, sampleFractionsFor, aggregateSnapshots, type SamplePoint } from './logic/weatherSampling'
import { parseGeoFile, thinCoordinates, idealWaypointCount } from './logic/parseGeoFile'

export interface RouteState {
  slipperiness: SlippinessResult
  distanceKm: number
  durationMin: number
  dominantSurface: string
  surfaceCounts: Record<string, number>
  currentTemp: number
  overnightLow: number
  recentPrecipMm: number
  precipType: string
  rainNextHours: number
  windSpeedMs: number
  windGustMs: number
  hasIceAlert: boolean
  alertEvent: string
  alertAwareness: AlertAwareness | null
  alertValidUntil: string
  sampleSource: SamplePoint
}

export interface Results {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
  coordinates: [number, number, number][]
  segments: RouteSegment[]
  // Empty when single-point (midpoint) sampling was used
  sampleFractions: number[]
}

type Theme = 'dark' | 'light'
export type { Theme }

interface AppError {
  source: 'route' | 'weather' | 'unknown'
  message: string
}

const COOLDOWN_MS = 30_000
const IMPORT_SNAP_RADIUS_M = 50

function buildState(w: WeatherData, route: RouteResult, source: SamplePoint): RouteState {
  return {
    slipperiness: calculateSlipperiness(w, route.surfaceCounts, route.distanceKm * 1000),
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    dominantSurface: route.dominantSurface,
    surfaceCounts: route.surfaceCounts,
    currentTemp: w.currentTemp,
    overnightLow: w.overnightLow,
    recentPrecipMm: w.recentPrecipMm,
    precipType: w.precipType,
    rainNextHours: w.rainNextHours,
    windSpeedMs: w.windSpeedMs,
    windGustMs: w.windGustMs,
    hasIceAlert: w.hasIceAlert,
    alertEvent: w.alertEvent,
    alertAwareness: w.alertAwareness,
    alertValidUntil: w.alertValidUntil,
    sampleSource: source,
  }
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('slippery_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function App() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [fontScale, setFontScale] = useState<FontScale>(loadFontScale)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<AppError | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [lastWaypoints, setLastWaypoints] = useState<Waypoint[]>([])
  const [tyrePref, setTyrePref] = useState<TyrePref | null>(loadTyrePref)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(loadSavedRoutes)
  const [formKey, setFormKey] = useState(0)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRouteRef = useRef<RouteResult | null>(null)

  const chooseTyrePref = useCallback((pref: TyrePref) => {
    saveTyrePref(pref)
    setTyrePref(pref)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('slippery_theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScaleToPercent(fontScale)}%`
    saveFontScale(fontScale)
  }, [fontScale])

  const adjustFontScale = useCallback((delta: 1 | -1) => {
    setFontScale((prev) => clampFontScale(prev + delta))
  }, [])

  useEffect(() => () => {
    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const toggleFocusMode = useCallback(() => setFocusMode((f) => !f), [])

  const toggleLang = useCallback(() => {
    const next = i18n.language === 'no' ? 'en' : 'no'
    i18n.changeLanguage(next)
    localStorage.setItem('slippery_lang', next)
  }, [])

  const [routePreview, setRoutePreview] = useState<RouteResult | null>(null)

  const handleFetchRoute = useCallback(async (waypoints: Waypoint[]) => {
    const { from, to } = loadAddresses()
    if (!from || !to) return

    setError(null)
    setLastWaypoints(waypoints)

    const cached = getCached(from, to, waypoints)
    if (cached) {
      setResults(cached.results)
      setLastCheckedAt(cached.ts)
      setStatus('idle')
      setRoutePreview(null)
      setCooldownUntil(Date.now() + COOLDOWN_MS)
      if (cached.results.coordinates.length) {
        const grid = buildElevationGrid(cached.results.coordinates)
        renderAsciiBackground(grid, cached.results.coordinates)
      }
      return
    }

    setStatus('loading')

    try {
      const route = await withRetry(() => fetchRoute(from, to, waypoints))
      setRoutePreview(route)
      setStatus('idle')
    } catch (err) {
      setError({ source: 'route', message: err instanceof Error ? err.message : String(err) })
      setStatus('error')
    }
  }, [])

  const handleFetchWeather = useCallback(async (route: RouteResult, waypoints: Waypoint[]) => {
    const { from, to } = loadAddresses()
    if (!from || !to) return

    setStatus('loading')
    setResults(null)
    setRoutePreview(null)

    let weather: Awaited<ReturnType<typeof fetchWeatherAll>>
    let sources: { now: SamplePoint; plus2h: SamplePoint; plus8h: SamplePoint }
    let sampleFractions: number[] = []
    try {
      if (needsMultiPointSampling(route.distanceKm, route.coordinates)) {
        sampleFractions = sampleFractionsFor(route.distanceKm)
        const points = sampleCoordinates(route.coordinates, sampleFractions)
        const snapshots = await withRetry(() =>
          Promise.all(points.map(([lat, lng]) => fetchWeatherAll(lat, lng))),
        )
        const aggregated = aggregateSnapshots(snapshots, route.surfaceCounts, route.distanceKm * 1000, sampleFractions)
        weather = { now: aggregated.now, plus2h: aggregated.plus2h, plus8h: aggregated.plus8h }
        sources = { now: aggregated.nowSource, plus2h: aggregated.plus2hSource, plus8h: aggregated.plus8hSource }
      } else {
        const midLat = (from.lat + to.lat) / 2
        const midLng = (from.lng + to.lng) / 2
        weather = await withRetry(() => fetchWeatherAll(midLat, midLng))
        sources = { now: 'midpoint', plus2h: 'midpoint', plus8h: 'midpoint' }
      }
    } catch (err) {
      setError({ source: 'weather', message: err instanceof Error ? err.message : String(err) })
      setStatus('error')
      return
    }

    const newResults: Results = {
      now: buildState(weather.now, route, sources.now),
      plus2h: buildState(weather.plus2h, route, sources.plus2h),
      plus8h: buildState(weather.plus8h, route, sources.plus8h),
      coordinates: route.coordinates,
      segments: route.segments,
      sampleFractions,
    }

    const ts = setCached(from, to, waypoints, newResults)
    setResults(newResults)
    setLastCheckedAt(ts)
    setStatus('idle')
    setCooldownUntil(Date.now() + COOLDOWN_MS)

    const grid = buildElevationGrid(route.coordinates)
    renderAsciiBackground(grid, route.coordinates)
    lastRouteRef.current = route
  }, [])

  const handleRetry = useCallback(() => {
    handleFetchRoute(lastWaypoints)
  }, [handleFetchRoute, lastWaypoints])

  const handleImportedRoute = useCallback(async (rawCoords: [number, number][]) => {
    if (rawCoords.length < 2) return
    const thinned = thinCoordinates(rawCoords, idealWaypointCount(rawCoords))
    const fromCoord = thinned[0]
    const toCoord = thinned[thinned.length - 1]
    const interior = thinned.slice(1, -1)

    const from = { lat: fromCoord[1], lng: fromCoord[0] }
    const to = { lat: toCoord[1], lng: toCoord[0] }
    const waypointsFull: Waypoint[] = interior.map((c, i) => ({ id: i, label: '', lat: c[1], lng: c[0] }))

    setError(null)
    setStatus('loading')

    const [fromLabel, toLabel] = await Promise.all([
      geocodeReverse(from.lat, from.lng),
      geocodeReverse(to.lat, to.lng),
    ])
    saveAddress('from', { label: fromLabel?.label ?? `${from.lat.toFixed(5)}, ${from.lng.toFixed(5)}`, lat: from.lat, lng: from.lng })
    saveAddress('to', { label: toLabel?.label ?? `${to.lat.toFixed(5)}, ${to.lng.toFixed(5)}`, lat: to.lat, lng: to.lng })
    setFormKey((k) => k + 1)

    try {
      const route = await withRetry(() => fetchRoute(from, to, waypointsFull, IMPORT_SNAP_RADIUS_M))
      await handleFetchWeather(route, waypointsFull)
    } catch (err) {
      setError({ source: 'route', message: err instanceof Error ? err.message : String(err) })
      setStatus('error')
    }
  }, [handleFetchWeather])

  const handleSaveRoute = useCallback((name: string): 'ok' | 'limit' | 'error' => {
    const route = lastRouteRef.current
    if (!route) return 'error'
    const { from, to, waypoints } = loadAddresses()
    if (!from || !to) return 'error'
    const next = addSavedRoute({ name, from, to, waypoints, route, routeCachedAt: Date.now() })
    if (next === 'limit') return 'limit'
    if (next === 'error') return 'error'
    setSavedRoutes(next)
    return 'ok'
  }, [])

  const handleLoadSavedRoute = useCallback((saved: SavedRoute) => {
    saveAddress('from', saved.from)
    saveAddress('to', saved.to)
    saveWaypoints(saved.waypoints)
    setFormKey((k) => k + 1)
    const waypoints: Waypoint[] = saved.waypoints.map((w, i) => ({ id: i, ...w }))
    setLastWaypoints(waypoints)
    handleFetchWeather(saved.route, waypoints)
  }, [handleFetchWeather])

  const handleDeleteSavedRoute = useCallback((index: number) => {
    setSavedRoutes(deleteSavedRoute(index))
  }, [])

  const handleClearData = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true)
      clearConfirmTimer.current = setTimeout(() => setClearConfirm(false), 4000)
      return
    }
    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
    clearUserData()
    lastRouteRef.current = null
    clearAsciiBackground()
    setSavedRoutes([])
    setResults(null)
    setRoutePreview(null)
    setLastCheckedAt(null)
    setLastWaypoints([])
    setCooldownUntil(0)
    setError(null)
    setTyrePref(null)
    setStatus('idle')
    setFormKey((k) => k + 1)
    setClearConfirm(false)
  }, [clearConfirm])

  const showVerdict = results != null && tyrePref != null
  const showTyrePrompt = results != null && tyrePref == null

  return (
    <div id="app">
      <AppHeader
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleLang={toggleLang}
        fontScale={fontScale}
        onAdjustFontScale={adjustFontScale}
        focusMode={focusMode}
        onToggleFocus={toggleFocusMode}
        canFocus={results != null}
      />
      <main>
        {status === 'loading' && (
          <div className="card loading-state">
            <div className="spinner" />
            {t('app.loading')}
          </div>
        )}
        {status === 'error' && error && (
          <div className="card error-box">
            <AlertTriangle size={15} />
            <div className="error-content">
              <strong>{t(`error.${error.source}Failed`)}</strong>
              <p>{error.message}</p>
              <Button onClick={handleRetry}>
                <RefreshCw size={13} />
                {t('error.tryAgain')}
              </Button>
            </div>
          </div>
        )}
        {showVerdict && (
          <Verdict
            now={results.now}
            plus2h={results.plus2h}
            plus8h={results.plus8h}
            lastCheckedAt={lastCheckedAt}
            coordinates={results.coordinates}
            segments={results.segments}
            sampleFractions={results.sampleFractions}
            tyrePref={tyrePref}
            onChangeTyrePref={chooseTyrePref}
            focusMode={focusMode}
          />
        )}
        {!focusMode && showTyrePrompt && <TyrePrompt onChoose={chooseTyrePref} />}
        {!focusMode && (
          <AddressForm
            key={formKey}
            onFetchRoute={handleFetchRoute}
            onConfirm={(waypoints) => routePreview && handleFetchWeather(routePreview, waypoints)}
            onAddressChange={() => setRoutePreview(null)}
            routePreview={routePreview}
            loading={status === 'loading'}
            cooldownUntil={cooldownUntil}
            onSaveRoute={handleSaveRoute}
            canSave={results != null && savedRoutes.length < MAX_SAVED_ROUTES}
            onImportRoute={handleImportedRoute}
          />
        )}
        {!focusMode && (
          <SavedRoutesList routes={savedRoutes} onLoad={handleLoadSavedRoute} onDelete={handleDeleteSavedRoute} />
        )}
      </main>
      {!focusMode && (
        <footer className="app-footer">
          <button
            type="button"
            className={`clear-data-btn${clearConfirm ? ' clear-data-btn--confirm' : ''}`}
            onClick={handleClearData}
          >
            {clearConfirm ? t('footer.clearDataConfirm') : t('footer.clearData')}
          </button>
        </footer>
      )}
    </div>
  )
}
