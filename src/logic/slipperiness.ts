import type { WeatherData } from '../api/met'

export type RiskLevel = 'clear' | 'caution' | 'high' | 'dont-ride'

export interface Factor {
  key: string
  params?: Record<string, string | number>
}

export interface SlippinessResult {
  normalRisk: RiskLevel
  studdedRisk: RiskLevel
  score: number
  factors: Factor[]
}

const RISK_THRESHOLDS: [number, RiskLevel][] = [
  [80, 'dont-ride'],
  [56, 'high'],
  [26, 'caution'],
  [0, 'clear'],
]

function scoreToRisk(score: number): RiskLevel {
  for (const [threshold, level] of RISK_THRESHOLDS) {
    if (score >= threshold) return level
  }
  return 'clear'
}

export function calculateSlipperiness(weather: WeatherData, dominantSurface: string): SlippinessResult {
  let score = 0
  const factors: Factor[] = []

  if (weather.overnightLow < 0) {
    score += 30
    factors.push({ key: 'factor.overnight_low', params: { temp: weather.overnightLow.toFixed(1) } })
  }
  if (weather.overnightLow < -3) {
    score += 20
    factors.push({ key: 'factor.hard_freeze' })
  }
  if (weather.currentTemp < 2) {
    score += 15
    factors.push({ key: 'factor.cold_current', params: { temp: weather.currentTemp.toFixed(1) } })
  }
  // thaw is especially risky — surface looks clear but black ice can remain
  if (weather.currentTemp >= 0 && weather.currentTemp <= 3 && weather.overnightLow < 0) {
    score += 10
    factors.push({ key: 'factor.thaw' })
  }

  if (weather.recentPrecipMm > 0 && weather.overnightLow < 2) {
    score += 20
    if (weather.precipType === 'snow') {
      score += 15
      factors.push({ key: 'factor.snow_precip', params: { mm: weather.recentPrecipMm.toFixed(1) } })
    } else if (weather.precipType === 'sleet') {
      score += 8
      factors.push({ key: 'factor.sleet_precip', params: { mm: weather.recentPrecipMm.toFixed(1) } })
    } else {
      factors.push({ key: 'factor.rain_cold', params: { mm: weather.recentPrecipMm.toFixed(1) } })
    }
  }

  const surface = dominantSurface.toLowerCase()
  if (surface.includes('cobblestone')) {
    score += 10
    factors.push({ key: 'factor.cobblestone' })
  } else if (surface.includes('gravel') || surface === 'unpaved' || surface === 'dirt') {
    score += 5
    factors.push({ key: 'factor.surface', params: { surface: dominantSurface } })
  }

  if (weather.hasIceAlert) {
    score += 25
    factors.push({ key: 'factor.ice_alert' })
  }

  if (factors.length === 0) {
    factors.push({ key: 'factor.clear' })
  }

  const studdedScore = Math.max(0, score - 35)

  return {
    score,
    normalRisk: scoreToRisk(score),
    studdedRisk: scoreToRisk(studdedScore),
    factors,
  }
}
