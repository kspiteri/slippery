import type { WeatherData, WeatherSnapshot } from '../api/met'
import { calculateSlipperiness } from './slipperiness'

const MULTI_POINT_DISTANCE_KM = 5
const MULTI_POINT_ELEVATION_GAIN_M = 100
export const SAMPLE_FRACTIONS = [1 / 6, 1 / 2, 5 / 6]

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

const FRACTION_LABELS: SamplePoint[] = ['start', 'mid', 'end']

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
): [number, number][] {
  if (coordinates.length === 0) return []
  const cumulative: number[] = [0]
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + approxDistanceM(coordinates[i - 1], coordinates[i]))
  }
  const total = cumulative[cumulative.length - 1]
  return SAMPLE_FRACTIONS.map((fraction) => {
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
): AggregatedSnapshot {
  const now    = worstWeather(snapshots.map((s) => s.now),    surfaceCounts, totalMeters)
  const plus2h = worstWeather(snapshots.map((s) => s.plus2h), surfaceCounts, totalMeters)
  const plus8h = worstWeather(snapshots.map((s) => s.plus8h), surfaceCounts, totalMeters)
  return {
    now: now.data,
    plus2h: plus2h.data,
    plus8h: plus8h.data,
    nowSource: FRACTION_LABELS[now.index],
    plus2hSource: FRACTION_LABELS[plus2h.index],
    plus8hSource: FRACTION_LABELS[plus8h.index],
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
  const wettestNext = Math.max(...candidates.map((c) => c.rainNextHours))
  const promotedType: WeatherData['precipType'] =
    candidates.some((c) => c.precipType === 'snow')  ? 'snow'  :
    candidates.some((c) => c.precipType === 'sleet') ? 'sleet' :
    candidates.some((c) => c.precipType === 'rain')  ? 'rain'  :
    worst.precipType

  return {
    data: {
      ...worst,
      recentPrecipMm: wettestRecent,
      rainNextHours: wettestNext,
      precipType: promotedType,
      hasIceAlert: candidates.some((c) => c.hasIceAlert),
      alertSummary: candidates.map((c) => c.alertSummary).filter(Boolean).join('; '),
    },
    index: worstIndex,
  }
}

// Equirectangular approximation — accurate enough at ride-length distances, much faster than full haversine
export function approxDistanceM(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const R = 6371000
  const dLat = (b[1] - a[1]) * Math.PI / 180
  const dLng = (b[0] - a[0]) * Math.PI / 180
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180
  return Math.sqrt(dLat * dLat + (dLng * Math.cos(lat)) ** 2) * R
}
