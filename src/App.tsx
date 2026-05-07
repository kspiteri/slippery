import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon, RefreshCw, Bookmark, X } from 'lucide-react'
import i18n from './i18n'
import {
  loadAddresses, saveAddress, saveWaypoints,
  loadTyrePref, saveTyrePref, type TyrePref,
  loadSavedRoutes, addSavedRoute, deleteSavedRoute, clearUserData,
  type SavedRoute, MAX_SAVED_ROUTES,
} from './state'
import { fetchRoute, type RouteResult } from './api/ors'
import { fetchWeatherAll } from './api/met'
import { buildElevationGrid } from './api/elevation'
import { calculateSlipperiness, type SlippinessResult } from './logic/slipperiness'
import { renderAsciiBackground, clearAsciiBackground } from './ui/ascii'
import { AddressForm, type Waypoint } from './ui/AddressForm'
import { Verdict } from './ui/Verdict'
import { AlertTriangle } from 'lucide-react'
import { withRetry } from './lib/retry'
import { getCached, setCached } from './cache'
import { needsMultiPointSampling, sampleCoordinates, aggregateSnapshots, type SamplePoint } from './logic/weatherSampling'

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
  hasIceAlert: boolean
  sampleSource: SamplePoint
}

export interface Results {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
  coordinates: [number, number, number][]
  multiPoint: boolean
}

type Theme = 'dark' | 'light'

interface AppError {
  source: 'route' | 'weather' | 'unknown'
  message: string
}

const COOLDOWN_MS = 30_000
const ROUTE_STALE_MS = 30 * 24 * 60 * 60 * 1000

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('slippery_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function App() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
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

  useEffect(() => () => {
    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const toggleLang = useCallback(() => {
    const next = i18n.language === 'no' ? 'en' : 'no'
    i18n.changeLanguage(next)
    localStorage.setItem('slippery_lang', next)
  }, [])

  const handleCheck = useCallback(async (waypoints: Waypoint[], preloadedRoute?: RouteResult) => {
    const { from, to } = loadAddresses()
    if (!from || !to) return

    setError(null)
    setLastWaypoints(waypoints)

    if (!preloadedRoute) {
      const cached = getCached(from, to, waypoints)
      if (cached) {
        setResults(cached.results)
        setLastCheckedAt(cached.ts)
        setStatus('idle')
        setCooldownUntil(Date.now() + COOLDOWN_MS)
        if (cached.results.coordinates.length) {
          const grid = buildElevationGrid(cached.results.coordinates)
          renderAsciiBackground(grid, cached.results.coordinates)
        }
        return
      }
    }

    setStatus('loading')
    setResults(null)

    let route: RouteResult
    if (preloadedRoute) {
      route = preloadedRoute
    } else {
      try {
        route = await withRetry(() => fetchRoute(from, to, waypoints))
      } catch (err) {
        setError({ source: 'route', message: err instanceof Error ? err.message : String(err) })
        setStatus('error')
        return
      }
    }

    let weather: Awaited<ReturnType<typeof fetchWeatherAll>>
    let sources: { now: SamplePoint; plus2h: SamplePoint; plus8h: SamplePoint }
    try {
      if (needsMultiPointSampling(route.distanceKm, route.coordinates)) {
        const points = sampleCoordinates(route.coordinates)
        const snapshots = await withRetry(() =>
          Promise.all(points.map(([lat, lng]) => fetchWeatherAll(lat, lng))),
        )
        const aggregated = aggregateSnapshots(snapshots, route.surfaceCounts, route.distanceKm * 1000)
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

    function buildState(w: typeof weather.now, source: SamplePoint): RouteState {
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
        hasIceAlert: w.hasIceAlert,
        sampleSource: source,
      }
    }

    const newResults: Results = {
      now: buildState(weather.now, sources.now),
      plus2h: buildState(weather.plus2h, sources.plus2h),
      plus8h: buildState(weather.plus8h, sources.plus8h),
      coordinates: route.coordinates,
      multiPoint: sources.now !== 'midpoint',
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
    handleCheck(lastWaypoints)
  }, [handleCheck, lastWaypoints])

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
    handleCheck(waypoints, saved.route)
  }, [handleCheck])

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
      <header className="app-header">
        <div className="header-title">
          <h1>slippery</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="lang-btn" onClick={toggleLang}>{t('header.toggleLang')}</button>
          <button className="theme-btn" onClick={toggleTheme} aria-label={t('header.toggleTheme')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <main>
        {showVerdict && (
          <Verdict
            now={results.now}
            plus2h={results.plus2h}
            plus8h={results.plus8h}
            lastCheckedAt={lastCheckedAt}
            coordinates={results.coordinates}
            multiPoint={results.multiPoint}
            tyrePref={tyrePref}
            onChangeTyrePref={chooseTyrePref}
          />
        )}
        {showTyrePrompt && (
          <div className="card tyre-prompt">
            <div className="tyre-prompt-heading">{t('tyrePrompt.heading')}</div>
            <p className="tyre-prompt-body">{t('tyrePrompt.body')}</p>
            <div className="tyre-prompt-actions">
              <button type="button" onClick={() => chooseTyrePref('normal')}>
                {t('tyrePrompt.normal')}
              </button>
              <button type="button" onClick={() => chooseTyrePref('studded')}>
                {t('tyrePrompt.studded')}
              </button>
            </div>
          </div>
        )}
        <AddressForm
          key={formKey}
          onCheck={handleCheck}
          loading={status === 'loading'}
          cooldownUntil={cooldownUntil}
          onSaveRoute={handleSaveRoute}
          canSave={results != null && savedRoutes.length < MAX_SAVED_ROUTES}
        />

        {savedRoutes.length > 0 && (
          <div className="saved-routes card">
            <div className="saved-routes-header">
              <span className="saved-routes-label">{t('savedRoutes.label')}</span>
              <span className="saved-routes-count">{savedRoutes.length}/{MAX_SAVED_ROUTES}</span>
            </div>
            <ul className="saved-routes-list">
              {savedRoutes.map((r, i) => {
                const stale = Date.now() - r.routeCachedAt > ROUTE_STALE_MS
                return (
                  <li key={`${r.name}-${r.routeCachedAt}`} className="saved-route-item">
                    <button
                      type="button"
                      className="saved-route-load"
                      onClick={() => handleLoadSavedRoute(r)}
                    >
                      <Bookmark size={12} />
                      <span className="saved-route-name">{r.name}</span>
                      {stale && <span className="saved-route-stale">{t('savedRoutes.stale')}</span>}
                    </button>
                    <button
                      type="button"
                      className="saved-route-delete"
                      aria-label={t('savedRoutes.delete')}
                      onClick={() => handleDeleteSavedRoute(i)}
                    >
                      <X size={12} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

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
              <button type="button" className="retry-btn" onClick={handleRetry}>
                <RefreshCw size={13} />
                {t('error.tryAgain')}
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="app-footer">
        <button
          type="button"
          className={`clear-data-btn${clearConfirm ? ' clear-data-btn--confirm' : ''}`}
          onClick={handleClearData}
        >
          {clearConfirm ? t('footer.clearDataConfirm') : t('footer.clearData')}
        </button>
      </footer>
    </div>
  )
}
