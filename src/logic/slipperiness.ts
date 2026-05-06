import type { WeatherData } from '../api/met'

export type RiskLevel = 'clear' | 'caution' | 'high' | 'dont-ride'

export interface Factor {
  key: string
  params?: Record<string, string | number>
}

export interface BreakdownEntry {
  ruleKey: string
  points: number
  studsReduction: number
}

export interface SlippinessResult {
  normalRisk: RiskLevel
  studdedRisk: RiskLevel
  score: number
  studdedScore: number
  factors: Factor[]
  breakdown: BreakdownEntry[]
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

function sumMatching(
  surfaceCounts: Record<string, number>,
  predicate: (key: string) => boolean,
): number {
  let total = 0
  for (const [k, m] of Object.entries(surfaceCounts)) {
    if (predicate(k.toLowerCase())) total += m
  }
  return total
}

function pickDominantRough(surfaceCounts: Record<string, number>): string {
  let best = 'unpaved'
  let bestM = 0
  for (const [k, m] of Object.entries(surfaceCounts)) {
    const lower = k.toLowerCase()
    const isRough = lower.includes('gravel') || lower === 'unpaved' || lower === 'dirt' || lower === 'ground'
    if (isRough && m > bestM) {
      best = k
      bestM = m
    }
  }
  return best
}

export function calculateSlipperiness(
  weather: WeatherData,
  surfaceCounts: Record<string, number>,
  totalMeters: number,
): SlippinessResult {
  let score = 0
  let studdedReduction = 0
  const factors: Factor[] = []
  const breakdown: BreakdownEntry[] = []

  function addRule(ruleKey: string, points: number, studsReduction: number, factor?: Factor) {
    score += points
    studdedReduction += studsReduction
    breakdown.push({ ruleKey, points, studsReduction })
    if (factor) factors.push(factor)
  }

  if (weather.overnightLow < 0) {
    addRule('overnightLow', 30, 20, {
      key: 'factor.overnight_low',
      params: { temp: weather.overnightLow.toFixed(1) },
    })
  }
  if (weather.overnightLow < -3) {
    addRule('hardFreeze', 20, 15, { key: 'factor.hard_freeze' })
  }
  if (weather.currentTemp < 2) {
    addRule('coldCurrent', 15, 5, {
      key: 'factor.cold_current',
      params: { temp: weather.currentTemp.toFixed(1) },
    })
  }
  if (weather.currentTemp >= 0 && weather.currentTemp <= 3 && weather.overnightLow < 0) {
    addRule('thaw', 10, 8, { key: 'factor.thaw' })
  }

  if (weather.recentPrecipMm > 0 && weather.overnightLow < 2) {
    if (weather.precipType === 'snow') {
      addRule('coldPrecip', 20, 0)
      addRule('snowExtra', 15, 10, {
        key: 'factor.snow_precip',
        params: { mm: weather.recentPrecipMm.toFixed(1) },
      })
    } else if (weather.precipType === 'sleet') {
      addRule('coldPrecip', 20, 0)
      addRule('sleetExtra', 8, 4, {
        key: 'factor.sleet_precip',
        params: { mm: weather.recentPrecipMm.toFixed(1) },
      })
    } else {
      addRule('coldPrecip', 20, 0, {
        key: 'factor.rain_cold',
        params: { mm: weather.recentPrecipMm.toFixed(1) },
      })
    }
  }

  const safeTotal = totalMeters > 0 ? totalMeters : 1

  const cobbleM = sumMatching(surfaceCounts, (s) => s.includes('cobblestone'))
  const roughM = sumMatching(surfaceCounts, (s) => s.includes('gravel') || s === 'unpaved' || s === 'dirt' || s === 'ground')
  const iceM = sumMatching(surfaceCounts, (s) => s === 'ice')
  const snowM = sumMatching(surfaceCounts, (s) => s === 'snow')

  const cobbleImpact = Math.round(10 * (cobbleM / safeTotal))
  const roughImpact = Math.round(5 * (roughM / safeTotal))
  const iceImpact = Math.round(30 * (iceM / safeTotal))
  const snowImpact = Math.round(15 * (snowM / safeTotal))

  if (cobbleImpact > 0) {
    addRule('cobble', cobbleImpact, 0, { key: 'factor.cobblestone' })
  }
  if (roughImpact > 0) {
    addRule('rough', roughImpact, 0, {
      key: 'factor.surface',
      params: { surface: pickDominantRough(surfaceCounts) },
    })
  }
  if (iceImpact > 0) {
    addRule('iceSurface', iceImpact, iceImpact, { key: 'factor.ice_surface' })
  }
  if (snowImpact > 0) {
    addRule('snowSurface', snowImpact, Math.round(snowImpact * 0.7), { key: 'factor.snow_surface' })
  }

  if (weather.hasIceAlert) {
    addRule('iceAlert', 25, 15, { key: 'factor.ice_alert' })
  }

  if (factors.length === 0) {
    factors.push({ key: 'factor.clear' })
  }

  const studdedScore = Math.max(0, score - studdedReduction)

  return {
    score,
    studdedScore,
    normalRisk: scoreToRisk(score),
    studdedRisk: scoreToRisk(studdedScore),
    factors,
    breakdown,
  }
}
