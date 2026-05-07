import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bike, Clock, Thermometer, Droplets, AlertTriangle,
  Snowflake, Wind, Shirt, CheckCircle, CircleDot, History,
} from 'lucide-react'
import type { SlippinessResult, RiskLevel } from '../logic/slipperiness'
import type { RouteState } from '../App'
import type { RouteSegment } from '../api/ors'
import type { TyrePref } from '../state'
import { SURFACE_BUCKETS, SURFACE_COLOURS, surfaceColour, type SurfaceBucket } from '../logic/surfaces'
import { ElevationProfile } from './ElevationProfile'
import { RouteMap } from './RouteMap'

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

interface Props {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
  lastCheckedAt: number | null
  coordinates: [number, number, number][]
  segments: RouteSegment[]
  multiPoint: boolean
  tyrePref: TyrePref
  onChangeTyrePref: (pref: TyrePref) => void
  focusMode?: boolean
}

type Tab = 'now' | 'plus2h' | 'plus8h'

function StatusBadge({ risk }: { risk: RiskLevel }) {
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

function SurfaceBar({ counts }: { counts: Record<string, number> }) {
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

type StudsEffect =
  | { kind: 'flat';   value: number }
  | { kind: 'factor'; value: number }
  | { kind: 'full' }

interface ScoringRule {
  key: string
  maxPoints: number
  capped: boolean
  studs: StudsEffect
}

const SCORING_RULES: ScoringRule[] = [
  { key: 'overnightLow', maxPoints: 30, capped: false, studs: { kind: 'flat',   value: 20  } },
  { key: 'hardFreeze',   maxPoints: 20, capped: false, studs: { kind: 'flat',   value: 15  } },
  { key: 'coldCurrent',  maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 5   } },
  { key: 'thaw',         maxPoints: 10, capped: false, studs: { kind: 'flat',   value: 8   } },
  { key: 'coldPrecip',   maxPoints: 20, capped: false, studs: { kind: 'flat',   value: 0   } },
  { key: 'snowExtra',    maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 10  } },
  { key: 'sleetExtra',   maxPoints:  8, capped: false, studs: { kind: 'flat',   value: 4   } },
  { key: 'cobble',       maxPoints: 10, capped: true,  studs: { kind: 'flat',   value: 0   } },
  { key: 'rough',        maxPoints:  5, capped: true,  studs: { kind: 'flat',   value: 0   } },
  { key: 'iceSurface',   maxPoints: 30, capped: true,  studs: { kind: 'full'               } },
  { key: 'snowSurface',  maxPoints: 15, capped: true,  studs: { kind: 'factor', value: 0.7 } },
  { key: 'iceAlert',      maxPoints: 25, capped: false, studs: { kind: 'flat',   value: 15  } },
  { key: 'gustModerate',  maxPoints: 10, capped: false, studs: { kind: 'flat',   value: 0   } },
  { key: 'gustStrong',    maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 0   } },
]

function formatPoints(maxPoints: number, capped: boolean): string {
  return capped ? `≤+${maxPoints}` : `+${maxPoints}`
}

function studsEffective(rule: ScoringRule): string {
  const { maxPoints, capped, studs } = rule
  const prefix = capped ? '≤' : ''
  if (studs.kind === 'full')   return '+0'
  if (studs.kind === 'factor') return `${prefix}+${maxPoints - Math.round(maxPoints * studs.value)}`
  return `${prefix}+${Math.max(0, maxPoints - studs.value)}`
}

function HowScored({ result, tyrePref }: { result: SlippinessResult; tyrePref: TyrePref }) {
  const { t } = useTranslation()
  const { breakdown, score, studdedScore } = result
  const showStuds = tyrePref === 'studded'
  const totalForTyre = showStuds ? studdedScore : score

  return (
    <details className="how-scored">
      <summary>{t('howScored.toggle')}</summary>

      <div className="how-scored-current">
        <div className="how-scored-section-label">{t('howScored.current')}</div>
        {breakdown.length === 0 ? (
          <p className="how-scored-empty">{t('howScored.noRules')}</p>
        ) : (
          <table>
            <tbody>
              {breakdown.map((b, i) => {
                const effective = showStuds ? Math.max(0, b.points - b.studsReduction) : b.points
                return (
                  <tr key={`${b.ruleKey}-${i}`}>
                    <td>{t(`howScored.rules.${b.ruleKey}`)}</td>
                    <td>+{effective}</td>
                  </tr>
                )
              })}
              <tr className="totals-row">
                <td>{t('howScored.total')}</td>
                <td>{totalForTyre}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="how-scored-reference">
        <div className="how-scored-section-label">{t('howScored.reference')}</div>
        <p className="how-scored-intro">{t('howScored.intro')}</p>
        <table>
          <thead>
            <tr>
              <th>{t('howScored.ruleHeader')}</th>
              <th>{showStuds ? t('howScored.studdedPointsHeader') : t('howScored.pointsHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {SCORING_RULES.map((r) => (
              <tr key={r.key}>
                <td>{t(`howScored.rules.${r.key}`)}</td>
                <td>{showStuds ? studsEffective(r) : formatPoints(r.maxPoints, r.capped)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">{t('howScored.thresholds')}</p>
      </div>
    </details>
  )
}

function VerdictPanel({
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
          <span className="verdict-section-label">{t('verdict.roadConditions')}</span>
          <div className="tyre-toggle" role="group" aria-label={t('verdict.tyreToggleAria')}>
            <button
              type="button"
              className={`tyre-toggle-btn${tyrePref === 'normal' ? ' active' : ''}`}
              onClick={() => onChangeTyrePref('normal')}
            >
              {t('verdict.normalTyres')}
            </button>
            <button
              type="button"
              className={`tyre-toggle-btn${tyrePref === 'studded' ? ' active' : ''}`}
              onClick={() => onChangeTyrePref('studded')}
            >
              {t('verdict.studdedTyres')}
            </button>
          </div>
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

export function Verdict({ now, plus2h, plus8h, lastCheckedAt, coordinates, segments, multiPoint, tyrePref, onChangeTyrePref, focusMode }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('now')
  const [profileTab, setProfileTab] = useState<'elevation' | 'map'>('elevation')
  const [tick, setTick] = useState(Date.now())
  const active = tab === 'now' ? now : tab === 'plus2h' ? plus2h : plus8h

  useEffect(() => {
    if (lastCheckedAt == null) return
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [lastCheckedAt])

  function formatAgo(ts: number): string {
    const sec = Math.floor((tick - ts) / 1000)
    if (sec < 60) return t('verdict.justNow')
    const min = Math.floor(sec / 60)
    if (min < 60) return t('verdict.minutesAgo', { n: min })
    return t('verdict.hoursAgo', { n: Math.floor(min / 60) })
  }

  const routeBar = (
    <div className="verdict-route-bar">
      <span className="route-stat"><Bike size={13} />{now.distanceKm.toFixed(1)} km</span>
      <span className="route-stat"><Clock size={13} />{Math.round(now.durationMin)} min</span>
      {lastCheckedAt != null && (
        <span className="route-stat last-checked" title={new Date(lastCheckedAt).toLocaleString()}>
          <History size={13} />{formatAgo(lastCheckedAt)}
        </span>
      )}
    </div>
  )

  if (focusMode) {
    return (
      <div className="card verdict-card verdict-card--focus">
        {routeBar}
        <div className="verdict-focus-badge">
          <StatusBadge risk={tyrePref === 'studded' ? now.slipperiness.studdedRisk : now.slipperiness.normalRisk} />
        </div>
      </div>
    )
  }

  return (
    <div className="card verdict-card">
      {routeBar}

      <div className="profile-tabs">
        <button type="button" className={`profile-tab${profileTab === 'elevation' ? ' active' : ''}`} onClick={() => setProfileTab('elevation')}>{t('verdict.tabElevation')}</button>
        <button type="button" className={`profile-tab${profileTab === 'map' ? ' active' : ''}`} onClick={() => setProfileTab('map')}>{t('verdict.tabMap')}</button>
      </div>
      {profileTab === 'elevation'
        ? <ElevationProfile coordinates={coordinates} showSampleMarkers={multiPoint} color={surfaceColour(now.dominantSurface)} />
        : <RouteMap coordinates={coordinates} segments={segments} />
      }

      <SurfaceBar counts={now.surfaceCounts} />

      <div className="verdict-tabs">
        <button type="button" className={`verdict-tab${tab === 'now' ? ' active' : ''}`} onClick={() => setTab('now')}>{t('verdict.tabNow')}</button>
        <button type="button" className={`verdict-tab${tab === 'plus2h' ? ' active' : ''}`} onClick={() => setTab('plus2h')}>{t('verdict.tabPlus2h')}</button>
        <button type="button" className={`verdict-tab${tab === 'plus8h' ? ' active' : ''}`} onClick={() => setTab('plus8h')}>{t('verdict.tabPlus8h')}</button>
      </div>

      <VerdictPanel data={active} tab={tab} tyrePref={tyrePref} onChangeTyrePref={onChangeTyrePref} />
    </div>
  )
}
