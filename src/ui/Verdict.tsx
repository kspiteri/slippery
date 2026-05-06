import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bike, Clock, Thermometer, Droplets, AlertTriangle,
  Snowflake, Wind, Shirt, CheckCircle, Route, CircleDot, History,
} from 'lucide-react'
import type { SlippinessResult, RiskLevel } from '../logic/slipperiness'
import type { RouteState } from '../App'

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

function VerdictPanel({ data, tab }: { data: RouteState; tab: Tab }) {
  const { t } = useTranslation()
  const { slipperiness, recentPrecipMm, precipType, rainNextHours,
          overnightLow, hasIceAlert } = data
  const jacket = jacketVerdict(rainNextHours, recentPrecipMm, precipType)
  const jacketColor = JACKET_COLOURS[jacket]
  const JacketIcon = jacket === 'no' ? CheckCircle : Shirt

  const tempKey   = tab === 'now' ? 'pill.tempNow'   : tab === 'plus2h' ? 'pill.tempIn2h'   : 'pill.tempIn8h'
  const precipKey = tab === 'now' ? 'pill.precipNow' : tab === 'plus2h' ? 'pill.precipAt2h' : 'pill.precipAt8h'
  const rainKey   = tab === 'now' ? 'pill.rainNext3h' : tab === 'plus2h' ? 'pill.rainFrom2h' : 'pill.rainFrom8h'

  const factorText = slipperiness.factors
    .map((f) => t(f.key, f.params))
    .join(', ')

  return (
    <>
      <div className="verdict-summary">
        <CircleDot size={13} className="summary-icon" />
        <span>{factorText}</span>
      </div>

      <div className="verdict-body">
        <div className="verdict-section-label">{t('verdict.roadConditions')}</div>
        <div className="tyres-grid">
          <div className="tyre-row">
            <span className="tyre-label-group">{t('verdict.normalTyres')}</span>
            <StatusBadge risk={slipperiness.normalRisk} />
          </div>
          <div className="tyre-row">
            <span className="tyre-label-group">{t('verdict.studdedTyres')}</span>
            <StatusBadge risk={slipperiness.studdedRisk} />
          </div>
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
        </div>
      </div>
    </>
  )
}

export function Verdict({ now, plus2h, plus8h, lastCheckedAt }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('now')
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

  return (
    <div className="verdict-card">
      <div className="verdict-route-bar">
        <span className="route-stat"><Bike size={13} />{now.distanceKm.toFixed(1)} km</span>
        <span className="route-stat"><Clock size={13} />{Math.round(now.durationMin)} min</span>
        <span className="route-stat"><Route size={13} />{now.dominantSurface}</span>
        {lastCheckedAt != null && (
          <span
            className="route-stat last-checked"
            title={new Date(lastCheckedAt).toLocaleString()}
          >
            <History size={13} />{formatAgo(lastCheckedAt)}
          </span>
        )}
      </div>

      <div className="verdict-tabs">
        <button className={`verdict-tab${tab === 'now' ? ' active' : ''}`} onClick={() => setTab('now')}>{t('verdict.tabNow')}</button>
        <button className={`verdict-tab${tab === 'plus2h' ? ' active' : ''}`} onClick={() => setTab('plus2h')}>{t('verdict.tabPlus2h')}</button>
        <button className={`verdict-tab${tab === 'plus8h' ? ' active' : ''}`} onClick={() => setTab('plus8h')}>{t('verdict.tabPlus8h')}</button>
      </div>

      <VerdictPanel data={active} tab={tab} />
    </div>
  )
}
