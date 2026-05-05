import { useState, useCallback, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { loadAddresses } from './state'
import { fetchRoute } from './api/ors'
import { fetchWeather } from './api/met'
import { buildElevationGrid } from './api/elevation'
import { calculateSlipperiness, type SlippinessResult } from './logic/slipperiness'
import { renderAsciiBackground } from './ui/ascii'
import { AddressForm } from './ui/AddressForm'
import { Verdict } from './ui/Verdict'
import { AlertTriangle } from 'lucide-react'

interface RouteState {
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

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('slippery_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<RouteState | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('slippery_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleCheck = useCallback(async () => {
    const { from, to } = loadAddresses()
    if (!from || !to) return

    setStatus('loading')
    setError('')
    setResult(null)

    try {
      const midLat = (from.lat + to.lat) / 2
      const midLng = (from.lng + to.lng) / 2

      const [route, weather] = await Promise.all([
        fetchRoute(from, to),
        fetchWeather(midLat, midLng),
      ])

      const slipperiness = calculateSlipperiness(weather, route.dominantSurface)

      setResult({
        slipperiness,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        dominantSurface: route.dominantSurface,
        currentTemp: weather.currentTemp,
        overnightLow: weather.overnightLow,
        recentPrecipMm: weather.recentPrecipMm,
        precipType: weather.precipType,
        rainNextHours: weather.rainNextHours,
        hasIceAlert: weather.hasIceAlert,
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
          <p className="subtitle">bergen bike conditions</p>
        </div>
        <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <main>
        <AddressForm onCheck={handleCheck} loading={status === 'loading'} />
        {status === 'loading' && (
          <div className="loading-state">
            <div className="spinner" />
            fetching route &amp; conditions…
          </div>
        )}
        {status === 'error' && (
          <div className="error-box">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        {result && <Verdict {...result} />}
      </main>
    </div>
  )
}
