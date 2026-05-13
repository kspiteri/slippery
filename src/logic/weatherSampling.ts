import type { AlertAwareness, WeatherData, WeatherSnapshot } from '../api/met'
import { calculateSlipperiness } from './slipperiness'
import { distanceM } from './geo'

const MULTI_POINT_DISTANCE_KM = 5
const MULTI_POINT_ELEVATION_GAIN_M = 100

export type SamplePoint = 'midpoint' | 'start' | 'mid' | 'end'

export interface AggregatedSnapshot {
  now: WeatherData
  plus2h: WeatherData
  plus8h: WeatherData
  // Which sample point's data drives the road-condition verdict at each horizon
  nowSource: SamplePoint
  plus2hSource: SamplePoint
  plus8hSource: SamplePoint
}

// More samples for longer routes — capped at 7 to stay polite to MET (each sample = 2 API calls).
export function sampleFractionsFor(distanceKm: number): number[] {
  const count = distanceKm > 200 ? 7 : distanceKm > 50 ? 5 : 3
  return Array.from({ length: count }, (_, i) => (2 * i + 1) / (2 * count))
}

function fractionLabel(fraction: number): SamplePoint {
  if (fraction < 1 / 3) return 'start'
  if (fraction < 2 / 3) return 'mid'
  return 'end'
}

export function elevationGain(coordinates: [number, number, number][]): number {
  let gain = 0
  for (let i = 1; i < coordinates.length; i++) {
    const delta = coordinates[i][2] - coordinates[i - 1][2]
    if (delta > 0) gain += delta
  }
  return gain
}

export function needsMultiPointSampling(
  distanceKm: number,
  coordinates: [number, number, number][],
): boolean {
  if (distanceKm > MULTI_POINT_DISTANCE_KM) return true
  return elevationGain(coordinates) > MULTI_POINT_ELEVATION_GAIN_M
}

export function sampleCoordinates(
  coordinates: [number, number, number][],
  fractions: number[],
): [number, number][] {
  if (coordinates.length === 0) return []
  const cumulative: number[] = [0]
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceM(coordinates[i - 1], coordinates[i]))
  }
  const total = cumulative[cumulative.length - 1]
  return fractions.map((fraction) => {
    const target = fraction * total
    let idx = cumulative.findIndex((d) => d >= target)
    if (idx < 0) idx = coordinates.length - 1
    const c = coordinates[idx]
    return [c[1], c[0]]
  })
}

export function aggregateSnapshots(
  snapshots: WeatherSnapshot[],
  surfaceCounts: Record<string, number>,
  totalMeters: number,
  fractions: number[],
): AggregatedSnapshot {
  const now    = worstWeather(snapshots.map((s) => s.now),    surfaceCounts, totalMeters)
  const plus2h = worstWeather(snapshots.map((s) => s.plus2h), surfaceCounts, totalMeters)
  const plus8h = worstWeather(snapshots.map((s) => s.plus8h), surfaceCounts, totalMeters)
  return {
    now: now.data,
    plus2h: plus2h.data,
    plus8h: plus8h.data,
    nowSource: fractionLabel(fractions[now.index]),
    plus2hSource: fractionLabel(fractions[plus2h.index]),
    plus8hSource: fractionLabel(fractions[plus8h.index]),
  }
}

function worstWeather(
  candidates: WeatherData[],
  surfaceCounts: Record<string, number>,
  totalMeters: number,
): { data: WeatherData; index: number } {
  let worst = candidates[0]
  let worstIndex = 0
  let worstScore = calculateSlipperiness(worst, surfaceCounts, totalMeters).score
  for (let i = 1; i < candidates.length; i++) {
    const score = calculateSlipperiness(candidates[i], surfaceCounts, totalMeters).score
    if (score > worstScore) {
      worstScore = score
      worst = candidates[i]
      worstIndex = i
    }
  }

  // Wettest point drives jacket recommendation, even if it isn't the worst for slipperiness
  const wettestRecent = Math.max(...candidates.map((c) => c.recentPrecipMm))
  const wettestLastHour = Math.max(...candidates.map((c) => c.precipLastHourMm))
  const wettestNext = Math.max(...candidates.map((c) => c.rainNextHours))
  const promotedType: WeatherData['precipType'] =
    candidates.some((c) => c.precipType === 'snow')  ? 'snow'  :
    candidates.some((c) => c.precipType === 'sleet') ? 'sleet' :
    candidates.some((c) => c.precipType === 'rain')  ? 'rain'  :
    worst.precipType

  // Most severe alert across sample points drives the alert display
  const AWARENESS_RANK: Record<AlertAwareness, number> = { green: 0, yellow: 1, orange: 2, red: 3 }
  const headline = candidates.reduce<WeatherData | null>((acc, c) => {
    if (!c.hasIceAlert) return acc
    if (!acc) return c
    const a = acc.alertAwareness ? AWARENESS_RANK[acc.alertAwareness] : 1
    const b = c.alertAwareness   ? AWARENESS_RANK[c.alertAwareness]   : 1
    return b > a ? c : acc
  }, null)

  return {
    data: {
      ...worst,
      recentPrecipMm: wettestRecent,
      precipLastHourMm: wettestLastHour,
      rainNextHours: wettestNext,
      precipType: promotedType,
      hasIceAlert: candidates.some((c) => c.hasIceAlert),
      alertSummary: candidates.map((c) => c.alertSummary).filter(Boolean).join('; '),
      alertEvent: headline?.alertEvent ?? '',
      alertAwareness: headline?.alertAwareness ?? null,
      alertValidUntil: headline?.alertValidUntil ?? '',
    },
    index: worstIndex,
  }
}
