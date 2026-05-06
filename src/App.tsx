import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon, RefreshCw } from 'lucide-react'
import i18n from './i18n'
import { loadAddresses, loadTyrePref, saveTyrePref, type TyrePref } from './state'
import { fetchRoute } from './api/ors'
import { fetchWeatherAll } from './api/met'
import { buildElevationGrid } from './api/elevation'
import { calculateSlipperiness, type SlippinessResult } from './logic/slipperiness'
import { renderAsciiBackground } from './ui/ascii'
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

  const chooseTyrePref = useCallback((pref: TyrePref) => {
    saveTyrePref(pref)
    setTyrePref(pref)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('slippery_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const toggleLang = useCallback(() => {
    const next = i18n.language === 'no' ? 'en' : 'no'
    i18n.changeLanguage(next)
    localStorage.setItem('slippery_lang', next)
  }, [])

  const handleCheck = useCallback(async (waypoints: Waypoint[]) => {
    const { from, to } = loadAddresses()
    if (!from || !to) return

    setError(null)
    setLastWaypoints(waypoints)

    const cached = getCached(from, to, waypoints)
    if (cached) {
      setResults(cached.results)
      setLastCheckedAt(cached.ts)
      setStatus('idle')
      setCooldownUntil(Date.now() + COOLDOWN_MS)
      return
    }

    setStatus('loading')
    setResults(null)

    let route: Awaited<ReturnType<typeof fetchRoute>>
    try {
      route = await withRetry(() => fetchRoute(from, to, waypoints))
    } catch (err) {
      setError({ source: 'route', message: err instanceof Error ? err.message : String(err) })
      setStatus('error')
      return
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
  }, [])

  const handleRetry = useCallback(() => {
    handleCheck(lastWaypoints)
  }, [handleCheck, lastWaypoints])

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
        <AddressForm onCheck={handleCheck} loading={status === 'loading'} cooldownUntil={cooldownUntil} />
        {status === 'loading' && (
          <div className="loading-state">
            <div className="spinner" />
            {t('app.loading')}
          </div>
        )}
        {status === 'error' && error && (
          <div className="error-box">
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
          <div className="tyre-prompt">
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
      </main>
    </div>
  )
}
