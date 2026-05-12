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

function jacketVerdict(rainNextHours: number, recentPrecipMm: number, precipType: string): JacketVerdict {
  if (recentPrecipMm > 0.1 || rainNextHours > 1 || precipType === 'snow' || precipType === 'sleet') return 'yes'
  if (rainNextHours > 0.2) return 'maybe'
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
  const jacket = jacketVerdict(rainNextHours, recentPrecipMm, precipType)
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
        <div className="tyre-row">
          <StatusBadge risk={tyrePref === 'studded' ? slipperiness.studdedRisk : slipperiness.normalRisk} />
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
