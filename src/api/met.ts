const USER_AGENT = 'slippery-bergen-pwa/1.0 github.com/kspiteri/slippery'

export type AlertAwareness = 'green' | 'yellow' | 'orange' | 'red'

export interface WeatherData {
  currentTemp: number
  overnightLow: number
  recentPrecipMm: number
  precipType: 'none' | 'rain' | 'sleet' | 'snow'
  rainNextHours: number   // total mm forecast in next 3h from offset
  precipLastHourMm: number // mm that fell in the hour ending at offset (0 if unavailable)
  windSpeedMs: number
  windGustMs: number
  hasIceAlert: boolean
  alertSummary: string
  alertEvent: string          // MET event name, e.g. "Isete veier"
  alertAwareness: AlertAwareness | null
  alertValidUntil: string     // ISO string or '' if unknown
}

export interface WeatherSnapshot {
  now: WeatherData
  plus2h: WeatherData
  plus8h: WeatherData
}

interface ForecastTimestep {
  time: string
  data: {
    instant: {
      details: {
        air_temperature: number
        wind_speed?: number
        wind_speed_of_gust?: number
      }
    }
    next_1_hours?: { details: { precipitation_amount: number }; summary: { symbol_code: string } }
  }
}

export async function fetchWeatherAll(lat: number, lng: number): Promise<WeatherSnapshot> {
  // MET requires <= 4 decimals; raw ORS coords have 6+, which triggers 403
  const safeLat = Number(lat.toFixed(4))
  const safeLng = Number(lng.toFixed(4))
  const [forecast, alerts] = await Promise.all([
    fetchForecast(safeLat, safeLng),
    fetchAlerts(safeLat, safeLng),
  ])

  return {
    now:    deriveWeather(forecast, alerts, 0),
    plus2h: deriveWeather(forecast, alerts, 2),
    plus8h: deriveWeather(forecast, alerts, 8),
  }
}

function deriveWeather(
  forecast: ForecastTimestep[],
  alerts: AlertBundle,
  offsetHours: number,
): WeatherData {
  const base = new Date()
  const origin = new Date(base.getTime() + offsetHours * 60 * 60 * 1000)
  const lookAhead8h = new Date(origin.getTime() + 8 * 60 * 60 * 1000)
  const lookAhead3h = new Date(origin.getTime() + 3 * 60 * 60 * 1000)

  // find the closest step at or after origin
  const currentIdx = forecast.findIndex((s) => new Date(s.time) >= origin)
  const currentStep = currentIdx >= 0 ? forecast[currentIdx] : forecast[0]
  // The step *before* currentStep covers the hour ending at origin — that's the "past hour" of precip.
  // For the "now" horizon (offset 0), MET's compact forecast usually starts at the current hour, so
  // the previous step covers ~30 min before now + 30 min after — still a fair proxy for recent precip.
  const prevStep = currentIdx > 0 ? forecast[currentIdx - 1] : undefined
  const precipLastHourMm = prevStep?.data.next_1_hours?.details.precipitation_amount ?? 0
  const currentTemp = currentStep?.data.instant.details.air_temperature ?? 5

  const comingSteps = forecast.filter((s) => {
    const t = new Date(s.time)
    return t >= origin && t <= lookAhead8h
  })
  const overnightLow = comingSteps.length
    ? Math.min(...comingSteps.map((s) => s.data.instant.details.air_temperature))
    : currentTemp

  const recentPrecipMm = currentStep?.data.next_1_hours?.details.precipitation_amount ?? 0

  const rainNextHours = forecast
    .filter((s) => { const t = new Date(s.time); return t >= origin && t <= lookAhead3h })
    .reduce((sum, s) => sum + (s.data.next_1_hours?.details.precipitation_amount ?? 0), 0)

  const precipType = inferPrecipType(recentPrecipMm, overnightLow, currentTemp, currentStep)
  const windSpeedMs = currentStep?.data.instant.details.wind_speed ?? 0
  const windGustMs = currentStep?.data.instant.details.wind_speed_of_gust ?? windSpeedMs

  return { currentTemp, overnightLow, recentPrecipMm, precipLastHourMm, precipType, rainNextHours, windSpeedMs, windGustMs, ...alerts }
}

async function fetchForecast(lat: number, lng: number): Promise<ForecastTimestep[]> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`MET forecast failed: ${res.status}`)
  const data = await res.json()
  return data.properties.timeseries as ForecastTimestep[]
}

type AlertBundle = {
  hasIceAlert: boolean
  alertSummary: string
  alertEvent: string
  alertAwareness: AlertAwareness | null
  alertValidUntil: string
}

const AWARENESS_RANK: Record<string, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

function normaliseAwareness(raw: unknown): AlertAwareness | null {
  if (typeof raw !== 'string') return null
  const lower = raw.toLowerCase()
  if (lower === 'green' || lower === 'yellow' || lower === 'orange' || lower === 'red') return lower
  // MET sometimes encodes as "2; yellow; Moderate" — extract a colour word if present
  const match = lower.match(/\b(green|yellow|orange|red)\b/)
  return (match?.[1] as AlertAwareness) ?? null
}

async function fetchAlerts(lat: number, lng: number): Promise<AlertBundle> {
  const empty: AlertBundle = {
    hasIceAlert: false, alertSummary: '', alertEvent: '', alertAwareness: null, alertValidUntil: '',
  }
  const url = `https://api.met.no/weatherapi/metalerts/2.0/all.json?lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return empty
  const data = await res.json()

  const ICE_EVENTS = ['ice', 'icing', 'blizzard', 'snow', 'slippery']
  const features = data.features ?? []
  const iceAlerts = features.filter((f: any) => {
    const event = (f.properties?.event ?? '').toLowerCase()
    return ICE_EVENTS.some((e) => event.includes(e))
  })

  if (iceAlerts.length === 0) return empty

  // Pick the most severe alert as the headline
  const headline = iceAlerts.reduce((worst: any, current: any) => {
    const w = AWARENESS_RANK[normaliseAwareness(worst.properties?.awareness_level) ?? 'yellow'] ?? 1
    const c = AWARENESS_RANK[normaliseAwareness(current.properties?.awareness_level) ?? 'yellow'] ?? 1
    return c > w ? current : worst
  })

  const alertSummary = iceAlerts
    .map((f: any) => f.properties?.description ?? f.properties?.event ?? '')
    .filter(Boolean)
    .join('; ')

  return {
    hasIceAlert: true,
    alertSummary,
    alertEvent: headline.properties?.event ?? '',
    alertAwareness: normaliseAwareness(headline.properties?.awareness_level),
    alertValidUntil: headline.when?.interval?.[1] ?? headline.properties?.eventEndingTime ?? '',
  }
}

function inferPrecipType(
  precipMm: number,
  overnightLow: number,
  currentTemp: number,
  step: ForecastTimestep | undefined,
): WeatherData['precipType'] {
  if (precipMm < 0.1) return 'none'

  const symbol = step?.data.next_1_hours?.summary.symbol_code ?? ''
  if (symbol.includes('snow') || symbol.includes('blizzard')) return 'snow'
  if (symbol.includes('sleet')) return 'sleet'
  if (symbol.includes('rain')) return 'rain'

  if (overnightLow < -2 || currentTemp < 0) return 'snow'
  if (currentTemp < 2) return 'sleet'
  return 'rain'
}
