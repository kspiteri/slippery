import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon } from 'lucide-react'
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

export interface RouteState {
  slipperiness: SlippinessResult
  distanceKm: number
  durationMin: number
  dominantSurface: string
  currentTemp: number
  overnightLow: number
  recentPrecipMm: number
  precipType: string
  rainNextHours: number
  hasIceAlert: boolean
}

interface Results {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
}

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('slippery_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function App() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Results | null>(null)

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

    setStatus('loading')
    setError('')
    setResults(null)

    try {
      const midLat = (from.lat + to.lat) / 2
      const midLng = (from.lng + to.lng) / 2

      const [route, weather] = await Promise.all([
        fetchRoute(from, to, waypoints),
        fetchWeatherAll(midLat, midLng),
      ])

      function buildState(w: typeof weather.now): RouteState {
        return {
          slipperiness: calculateSlipperiness(w, route.dominantSurface),
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          dominantSurface: route.dominantSurface,
          currentTemp: w.currentTemp,
          overnightLow: w.overnightLow,
          recentPrecipMm: w.recentPrecipMm,
          precipType: w.precipType,
          rainNextHours: w.rainNextHours,
          hasIceAlert: w.hasIceAlert,
        }
      }

      setResults({
        now:    buildState(weather.now),
        plus2h: buildState(weather.plus2h),
        plus8h: buildState(weather.plus8h),
      })
      setStatus('idle')

      const grid = buildElevationGrid(route.coordinates)
      renderAsciiBackground(grid, route.coordinates)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

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
        <AddressForm onCheck={handleCheck} loading={status === 'loading'} />
        {status === 'loading' && (
          <div className="loading-state">
            <div className="spinner" />
            {t('app.loading')}
          </div>
        )}
        {status === 'error' && (
          <div className="error-box">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        {results && <Verdict now={results.now} plus2h={results.plus2h} plus8h={results.plus8h} />}
      </main>
    </div>
  )
}
