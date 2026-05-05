import { useState } from 'react'
import {
  Bike, Clock, Thermometer, Droplets, AlertTriangle,
  Snowflake, Wind, Shirt, CheckCircle, Route, CircleDot,
} from 'lucide-react'
import type { SlippinessResult, RiskLevel } from '../logic/slipperiness'
import type { RouteState } from '../App'

const RISK_LABELS: Record<RiskLevel, string> = {
  'clear': 'Clear',
  'caution': 'Caution',
  'high': 'High risk',
  'dont-ride': "Don't ride",
}

const RISK_COLOURS: Record<RiskLevel, string> = {
  'clear': '#3fb950',
  'caution': '#d29922',
  'high': '#f0883e',
  'dont-ride': '#f85149',
}

interface Props {
  now: RouteState
  plus2h: RouteState
  plus8h: RouteState
}

type Tab = 'now' | 'plus2h' | 'plus8h'

function StatusBadge({ risk }: { risk: RiskLevel }) {
  const color = RISK_COLOURS[risk]
  return (
    <span className="status-badge" style={{ '--badge-color': color } as React.CSSProperties}>
      <span className="status-dot" />
      {RISK_LABELS[risk]}
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

const JACKET_LABELS: Record<JacketVerdict, string> = {
  yes: 'Bring a jacket',
  maybe: 'Maybe a jacket',
  no: 'No jacket needed',
}

const JACKET_COLOURS: Record<JacketVerdict, string> = {
  yes: '#58a6ff',
  maybe: '#d29922',
  no: '#3fb950',
}

function VerdictPanel({ data, tab }: { data: RouteState; tab: Tab }) {
  const { slipperiness, recentPrecipMm, precipType, rainNextHours,
          overnightLow, hasIceAlert } = data
  const jacket = jacketVerdict(rainNextHours, recentPrecipMm, precipType)
  const jacketColor = JACKET_COLOURS[jacket]
  const JacketIcon = jacket === 'no' ? CheckCircle : Shirt

  const tempLabel  = tab === 'now' ? 'now' : tab === 'plus2h' ? 'in 2h' : 'in 8h'
  const precipLabel = tab === 'now' ? 'now' : tab === 'plus2h' ? 'at +2h' : 'at +8h'
  const rainLabel  = tab === 'now' ? 'next 3h' : tab === 'plus2h' ? '3h from +2h' : '3h from +8h'

  return (
    <>
      <div className="verdict-summary">
        <CircleDot size={13} className="summary-icon" />
        <span>{slipperiness.reason}</span>
      </div>

      <div className="verdict-body">
        <div className="verdict-section-label">road conditions</div>
        <div className="tyres-grid">
          <div className="tyre-row">
            <span className="tyre-label-group">Normal tyres</span>
            <StatusBadge risk={slipperiness.normalRisk} />
          </div>
          <div className="tyre-row">
            <span className="tyre-label-group">Studded tyres</span>
            <StatusBadge risk={slipperiness.studdedRisk} />
          </div>
        </div>

        <div className="verdict-section-label">gear</div>
        <div
          className="jacket-row"
          style={{ '--jacket-color': jacketColor } as React.CSSProperties}
        >
          <span className="jacket-label-group">
            <JacketIcon size={14} className="jacket-icon" />
            Waterproof jacket
          </span>
          <span className="jacket-chip">{JACKET_LABELS[jacket]}</span>
        </div>

        <div className="weather-pills">
          <span className="weather-pill">
            <Thermometer size={11} />
            {data.currentTemp.toFixed(1)} °C {tempLabel}
          </span>
          <span className="weather-pill">
            <Thermometer size={11} />
            low {overnightLow.toFixed(1)} °C
          </span>
          {recentPrecipMm > 0.1 && (
            <span className="weather-pill">
              <PrecipIcon type={precipType} />
              {precipType} {recentPrecipMm.toFixed(1)} mm {precipLabel}
            </span>
          )}
          {rainNextHours > 0.1 && (
            <span className="weather-pill">
              <Droplets size={11} />
              {rainNextHours.toFixed(1)} mm {rainLabel}
            </span>
          )}
          {hasIceAlert && (
            <span className="weather-pill alert-pill">
              <AlertTriangle size={11} />
              Active weather warning
            </span>
          )}
        </div>
      </div>
    </>
  )
}

export function Verdict({ now, plus2h, plus8h }: Props) {
  const [tab, setTab] = useState<Tab>('now')
  const active = tab === 'now' ? now : tab === 'plus2h' ? plus2h : plus8h

  return (
    <div className="verdict-card">
      <div className="verdict-route-bar">
        <span className="route-stat"><Bike size={13} />{now.distanceKm.toFixed(1)} km</span>
        <span className="route-stat"><Clock size={13} />{Math.round(now.durationMin)} min</span>
        <span className="route-stat"><Route size={13} />{now.dominantSurface}</span>
      </div>

      <div className="verdict-tabs">
        <button className={`verdict-tab${tab === 'now' ? ' active' : ''}`} onClick={() => setTab('now')}>Now</button>
        <button className={`verdict-tab${tab === 'plus2h' ? ' active' : ''}`} onClick={() => setTab('plus2h')}>+2h</button>
        <button className={`verdict-tab${tab === 'plus8h' ? ' active' : ''}`} onClick={() => setTab('plus8h')}>+8h</button>
      </div>

      <VerdictPanel data={active} tab={tab} />
    </div>
  )
}
