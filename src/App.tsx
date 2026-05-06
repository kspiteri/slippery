import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon, RefreshCw } from 'lucide-react'
import i18n from './i18n'
import { loadAddresses } from './state'
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
}

export interface Results {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
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
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('slippery_theme', theme)
  }, [theme])

  // Tick once a second so the cooldown disabled-state lifts without user interaction.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  const onCooldown = nowTick < cooldownUntil

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
      setNowTick(Date.now())
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
    try {
      const midLat = (from.lat + to.lat) / 2
      const midLng = (from.lng + to.lng) / 2
      weather = await withRetry(() => fetchWeatherAll(midLat, midLng))
    } catch (err) {
      setError({ source: 'weather', message: err instanceof Error ? err.message : String(err) })
      setStatus('error')
      return
    }

    function buildState(w: typeof weather.now): RouteState {
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
      }
    }

    const newResults: Results = {
      now: buildState(weather.now),
      plus2h: buildState(weather.plus2h),
      plus8h: buildState(weather.plus8h),
    }

    const ts = setCached(from, to, waypoints, newResults)
    setResults(newResults)
    setLastCheckedAt(ts)
    setStatus('idle')
    setCooldownUntil(Date.now() + COOLDOWN_MS)
    setNowTick(Date.now())

    const grid = buildElevationGrid(route.coordinates)
    renderAsciiBackground(grid, route.coordinates)
  }, [])

  const handleRetry = useCallback(() => {
    handleCheck(lastWaypoints)
  }, [handleCheck, lastWaypoints])

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
        <AddressForm onCheck={handleCheck} loading={status === 'loading'} disabled={onCooldown} />
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
        {results && (
          <Verdict
            now={results.now}
            plus2h={results.plus2h}
            plus8h={results.plus8h}
            lastCheckedAt={lastCheckedAt}
          />
        )}
      </main>
    </div>
  )
}
