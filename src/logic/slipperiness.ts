import type { WeatherData } from '../api/met'

export type RiskLevel = 'clear' | 'caution' | 'high' | 'dont-ride'

export interface SlippinessResult {
  normalRisk: RiskLevel
  studdedRisk: RiskLevel
  score: number
  reason: string
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
  const factors: string[] = []

  if (weather.overnightLow < 0) {
    score += 30
    factors.push(`temp dropped to ${weather.overnightLow.toFixed(1)} °C overnight`)
  }
  if (weather.overnightLow < -3) {
    score += 20
    factors.push('hard freeze overnight')
  }
  if (weather.currentTemp < 2) {
    score += 15
    factors.push(`currently ${weather.currentTemp.toFixed(1)} °C`)
  }
  // thaw is especially risky — surface looks clear but black ice can remain
  if (weather.currentTemp >= 0 && weather.currentTemp <= 3 && weather.overnightLow < 0) {
    score += 10
    factors.push('thaw after freeze (black ice risk)')
  }

  if (weather.recentPrecipMm > 0 && weather.overnightLow < 2) {
    score += 20
    if (weather.precipType === 'snow') {
      score += 15
      factors.push(`snow (${weather.recentPrecipMm.toFixed(1)} mm) in past 3h`)
    } else if (weather.precipType === 'sleet') {
      score += 8
      factors.push(`sleet (${weather.recentPrecipMm.toFixed(1)} mm) in past 3h`)
    } else {
      factors.push(`rain (${weather.recentPrecipMm.toFixed(1)} mm) on cold roads`)
    }
  }

  const surface = dominantSurface.toLowerCase()
  if (surface.includes('cobblestone')) {
    score += 10
    factors.push('cobblestone surface')
  } else if (surface.includes('gravel') || surface === 'unpaved' || surface === 'dirt') {
    score += 5
    factors.push(`${dominantSurface} surface`)
  }

  if (weather.hasIceAlert) {
    score += 25
    factors.push('active ice/weather warning')
  }

  const studdedScore = Math.max(0, score - 35)

  const reason = factors.length
    ? factors.join(', ')
    : 'roads look clear'

  return {
    score,
    normalRisk: scoreToRisk(score),
    studdedRisk: scoreToRisk(studdedScore),
    reason,
  }
}
