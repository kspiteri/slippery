import { useTranslation } from 'react-i18next'
import {
  Thermometer, Droplets, AlertTriangle,
  Snowflake, Wind, Shirt, CheckCircle, CircleDot,
} from 'lucide-react'
import type { SlippinessResult, RiskLevel } from '../../logic/slipperiness'
import type { RouteState } from '../../App'
import type { TyrePref } from '../../state'
import { SURFACE_BUCKETS, SURFACE_COLOURS, type SurfaceBucket } from '../../logic/surfaces'
import { SegmentedToggle } from '../primitives/SegmentedToggle'
import { HowScored } from './HowScored'

const RISK_COLOURS: Record<RiskLevel, string> = {
  'clear': '#3fb950',
  'caution': '#d29922',
  'high': '#f0883e',
  'dont-ride': '#f85149',
}

const RISK_KEYS: Record<RiskLevel, string> = {
  'clear': 'risk.clear',
  'caution': 'risk.caution',
  'high': 'risk.high',
  'dont-ride': 'risk.dont_ride',
}

type JacketVerdict = 'yes' | 'maybe' | 'no'

// Cyclist's apparent wind ≈ real wind + ~5 m/s ride speed
const CYCLING_SPEED_MS = 5

// Classic wind chill index (Environment Canada). Valid for T <= 10 °C and V >= 4.8 km/h.
// Returns the air temp unchanged outside that range.
function feelsLike(tempC: number, windMs: number): number {
  if (tempC > 10) return tempC
  const apparentWindKmh = (windMs + CYCLING_SPEED_MS) * 3.6
  if (apparentWindKmh < 4.8) return tempC
  const v = Math.pow(apparentWindKmh, 0.16)
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v
}

function jacketVerdict(
  rainNextHours: number,
  recentPrecipMm: number,
  precipType: string,
  currentTemp: number,
  windSpeedMs: number,
): JacketVerdict {
  if (recentPrecipMm > 0.1 || rainNextHours > 1 || precipType === 'snow' || precipType === 'sleet') return 'yes'
  // Cold + windy: a windproof shell matters even on a dry day
  const feels = feelsLike(currentTemp, windSpeedMs)
  if (feels < 3) return 'yes'
  if (rainNextHours > 0.2 || feels < 7) return 'maybe'
  return 'no'
}

const JACKET_KEYS: Record<JacketVerdict, string> = {
  yes: 'jacket.yes',
  maybe: 'jacket.maybe',
  no: 'jacket.no',
}

const JACKET_COLOURS: Record<JacketVerdict, string> = {
  yes: '#58a6ff',
  maybe: '#d29922',
  no: '#3fb950',
}

interface SurfaceSegment {
  bucket: SurfaceBucket
  pct: number
}

function bucketSurfaces(counts: Record<string, number>): SurfaceSegment[] {
  const totals: Partial<Record<SurfaceBucket, number>> = {}
  let total = 0
  for (const [name, m] of Object.entries(counts)) {
    if (m <= 0) continue
    const bucket = SURFACE_BUCKETS[name.toLowerCase()] ?? 'other'
    totals[bucket] = (totals[bucket] ?? 0) + m
    total += m
  }
  if (total <= 0) return []
  return Object.entries(totals)
    .map(([bucket, m]) => ({ bucket: bucket as SurfaceBucket, pct: ((m as number) / total) * 100 }))
    .sort((a, b) => b.pct - a.pct)
}

export function SurfaceBar({ counts }: { counts: Record<string, number> }) {
  const { t } = useTranslation()
  const segments = bucketSurfaces(counts)
  if (segments.length === 0) return null
  const visible = segments.filter((s) => s.pct >= 1)
  return (
    <div className="surface-bar">
      <div className="surface-bar-track">
        {segments.map((s) => (
          <div
            key={s.bucket}
            className="surface-bar-segment"
            style={{ width: `${s.pct}%`, background: SURFACE_COLOURS[s.bucket] }}
            title={`${t(`surface.${s.bucket}`)} ${s.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="surface-bar-legend">
        {visible.map((s) => (
          <li key={s.bucket}>
            <span className="legend-dot" style={{ background: SURFACE_COLOURS[s.bucket] }} />
            <strong>{t(`surface.${s.bucket}`)}</strong>
            <span className="legend-pct">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StatusBadge({ risk }: { risk: RiskLevel }) {
  const { t } = useTranslation()
  const color = RISK_COLOURS[risk]
  return (
    <span className="status-badge" style={{ '--badge-color': color } as React.CSSProperties}>
      <span className="status-dot" />
      {t(RISK_KEYS[risk])}
    </span>
  )
}

const HEADLINE_KEYS: Record<RiskLevel, string> = {
  'clear': 'headline.clear',
  'caution': 'headline.caution',
  'high': 'headline.high',
  'dont-ride': 'headline.dont_ride',
}

const ALERT_BANNER_COLOURS: Record<string, string> = {
  orange: '#f0883e',
  red: '#f85149',
  yellow: '#d29922',
  green: '#3fb950',
}

function formatValidUntil(iso: string, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  return `${date} ${time}`
}

export function AlertBanner({ data }: { data: RouteState }) {
  const { t, i18n } = useTranslation()
  if (!data.hasIceAlert) return null
  // Yellow alerts stay as a quiet pill + tab dot; orange/red/unknown get a banner
  if (data.alertAwareness === 'yellow') return null
  const colour = ALERT_BANNER_COLOURS[data.alertAwareness ?? 'orange'] ?? ALERT_BANNER_COLOURS.orange
  const event = data.alertEvent || t('pill.iceAlert')
  const until = formatValidUntil(data.alertValidUntil, i18n.language)
  const text = until
    ? t('verdict.alertBannerUntil', { event, time: until })
    : t('verdict.alertBanner', { event })
  return (
    <div className="alert-banner" style={{ '--alert-color': colour } as React.CSSProperties}>
      <AlertTriangle size={14} />
      <span>{text}</span>
    </div>
  )
}

export function VerdictHero({ risk }: { risk: RiskLevel }) {
  const { t } = useTranslation()
  const color = RISK_COLOURS[risk]
  return (
    <div className="verdict-hero" style={{ '--hero-color': color } as React.CSSProperties}>
      <StatusBadge risk={risk} />
      <p className="verdict-hero-headline">{t(HEADLINE_KEYS[risk])}</p>
    </div>
  )
}

function PrecipIcon({ type }: { type: string }) {
  if (type === 'snow') return <Snowflake size={12} />
  if (type === 'sleet') return <Wind size={12} />
  return <Droplets size={12} />
}

type Tab = 'now' | 'plus2h' | 'plus8h'

export function VerdictPanel({
  data,
  tab,
  tyrePref,
  onChangeTyrePref,
}: {
  data: RouteState
  tab: Tab
  tyrePref: TyrePref
  onChangeTyrePref: (pref: TyrePref) => void
}) {
  const { t } = useTranslation()
  const { slipperiness, recentPrecipMm, precipType, rainNextHours,
          overnightLow, hasIceAlert, windSpeedMs, windGustMs } = data
  const jacket = jacketVerdict(rainNextHours, recentPrecipMm, precipType, data.currentTemp, windSpeedMs)
  const jacketColor = JACKET_COLOURS[jacket]
  const JacketIcon = jacket === 'no' ? CheckCircle : Shirt

  const tempKey   = tab === 'now' ? 'pill.tempNow'   : tab === 'plus2h' ? 'pill.tempIn2h'   : 'pill.tempIn8h'
  const precipKey = tab === 'now' ? 'pill.precipNow' : tab === 'plus2h' ? 'pill.precipAt2h' : 'pill.precipAt8h'
  const rainKey   = tab === 'now' ? 'pill.rainNext3h' : tab === 'plus2h' ? 'pill.rainFrom2h' : 'pill.rainFrom8h'

  const factorText = slipperiness.factors
    .map((f) => t(f.key, f.params))
    .join(' · ')

  const sampleSource = data.sampleSource
  const headingText = sampleSource === 'midpoint'
    ? t('verdict.conditions')
    : t('verdict.conditionsAt', { point: t(`sample.${sampleSource}`) })

  return (
    <>
      <div className="verdict-summary">
        <div className="verdict-summary-heading">{headingText}</div>
        <div className="verdict-summary-body">
          <CircleDot size={13} className="summary-icon" />
          <span className="summary-text">{factorText}</span>
        </div>
      </div>

      <div className="verdict-body">
        <div className="verdict-section-row">
          <span className="verdict-section-label">{t('verdict.studdedQuestion')}</span>
          <SegmentedToggle<TyrePref>
            value={tyrePref}
            onChange={onChangeTyrePref}
            options={[
              { value: 'normal', label: t('verdict.studdedNo') },
              { value: 'studded', label: t('verdict.studdedYes') },
            ]}
            ariaLabel={t('verdict.tyreToggleAria')}
          />
        </div>

        <div className="verdict-section-label">{t('verdict.gear')}</div>
        <div
          className="jacket-row"
          style={{ '--jacket-color': jacketColor } as React.CSSProperties}
        >
          <span className="jacket-label-group">
            <JacketIcon size={14} className="jacket-icon" />
            {t('verdict.jacket')}
          </span>
          <span className="jacket-chip">{t(JACKET_KEYS[jacket])}</span>
        </div>

        <div className="weather-pills">
          <span className="weather-pill">
            <Thermometer size={11} />
            {t(tempKey, { temp: data.currentTemp.toFixed(1) })}
          </span>
          <span className="weather-pill">
            <Thermometer size={11} />
            {t('pill.low', { temp: overnightLow.toFixed(1) })}
          </span>
          {recentPrecipMm > 0.1 && (
            <span className="weather-pill">
              <PrecipIcon type={precipType} />
              {t(precipKey, { type: precipType, mm: recentPrecipMm.toFixed(1) })}
            </span>
          )}
          {rainNextHours > 0.1 && (
            <span className="weather-pill">
              <Droplets size={11} />
              {t(rainKey, { mm: rainNextHours.toFixed(1) })}
            </span>
          )}
          {hasIceAlert && (
            <span className="weather-pill alert-pill">
              <AlertTriangle size={11} />
              {t('pill.iceAlert')}
            </span>
          )}
          <span className="weather-pill">
            <Wind size={11} />
            {t('pill.wind', { ms: Math.round(windSpeedMs) })}
          </span>
          {windGustMs > 12 && windGustMs > windSpeedMs + 3 && (
            <span className="weather-pill">
              <Wind size={11} />
              {t('pill.windGust', { ms: Math.round(windGustMs) })}
            </span>
          )}
        </div>

        <HowScored result={slipperiness} tyrePref={tyrePref} />
      </div>
    </>
  )
}
