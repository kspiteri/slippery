const USER_AGENT = 'slippery-bergen-pwa/1.0 github.com/kspiteri/slippery'

export interface WeatherData {
  currentTemp: number
  overnightLow: number
  recentPrecipMm: number
  precipType: 'none' | 'rain' | 'sleet' | 'snow'
  rainNextHours: number   // total mm forecast in next 3h from offset
  hasIceAlert: boolean
  alertSummary: string
}

export interface WeatherSnapshot {
  now: WeatherData
  plus2h: WeatherData
  plus8h: WeatherData
}

interface ForecastTimestep {
  time: string
  data: {
    instant: { details: { air_temperature: number; precipitation_amount?: number } }
    next_1_hours?: { details: { precipitation_amount: number }; summary: { symbol_code: string } }
  }
}

export async function fetchWeatherAll(lat: number, lng: number): Promise<WeatherSnapshot> {
  const [forecast, alerts] = await Promise.all([
    fetchForecast(lat, lng),
    fetchAlerts(lat, lng),
  ])

  return {
    now:    deriveWeather(forecast, alerts, 0),
    plus2h: deriveWeather(forecast, alerts, 2),
    plus8h: deriveWeather(forecast, alerts, 8),
  }
}

function deriveWeather(
  forecast: ForecastTimestep[],
  alerts: { hasIceAlert: boolean; alertSummary: string },
  offsetHours: number,
): WeatherData {
  const base = new Date()
  const origin = new Date(base.getTime() + offsetHours * 60 * 60 * 1000)
  const lookAhead8h = new Date(origin.getTime() + 8 * 60 * 60 * 1000)
  const lookAhead3h = new Date(origin.getTime() + 3 * 60 * 60 * 1000)

  // find the closest step at or after origin
  const currentStep = forecast.find((s) => new Date(s.time) >= origin) ?? forecast[0]
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

  return { currentTemp, overnightLow, recentPrecipMm, precipType, rainNextHours, ...alerts }
}

async function fetchForecast(lat: number, lng: number): Promise<ForecastTimestep[]> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`MET forecast failed: ${res.status}`)
  const data = await res.json()
  return data.properties.timeseries as ForecastTimestep[]
}

async function fetchAlerts(lat: number, lng: number): Promise<{ hasIceAlert: boolean; alertSummary: string }> {
  const url = `https://api.met.no/weatherapi/metalerts/2.0/all.json?lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return { hasIceAlert: false, alertSummary: '' }
  const data = await res.json()

  const ICE_EVENTS = ['ice', 'icing', 'blizzard', 'snow', 'slippery']
  const features = data.features ?? []
  const iceAlerts = features.filter((f: any) => {
    const event = (f.properties?.event ?? '').toLowerCase()
    return ICE_EVENTS.some((e) => event.includes(e))
  })

  const hasIceAlert = iceAlerts.length > 0
  const alertSummary = iceAlerts
    .map((f: any) => f.properties?.description ?? f.properties?.event ?? '')
    .filter(Boolean)
    .join('; ')

  return { hasIceAlert, alertSummary }
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
