import {
  Bike, Clock, Thermometer, Droplets, AlertTriangle,
  Snowflake, Wind, Shirt, CheckCircle, Route, CircleDot,
} from 'lucide-react'
import type { SlippinessResult, RiskLevel } from '../logic/slipperiness'

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
  slipperiness: SlippinessResult
  distanceKm: number
  durationMin: number
  dominantSurface: string
  currentTemp: number
  overnightLow: number
  recentPrecipMm: number
  precipType: string
  rainNextHours: number
  hasIceAlert: boolean
}

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

function jacketVerdict(rainNextHours: number, precipType: string): JacketVerdict {
  if (rainNextHours > 1 || precipType === 'snow' || precipType === 'sleet') return 'yes'
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

export function Verdict({
  slipperiness,
  distanceKm,
  durationMin,
  dominantSurface,
  currentTemp,
  overnightLow,
  recentPrecipMm,
  precipType,
  rainNextHours,
  hasIceAlert,
}: Props) {
  const jacket = jacketVerdict(rainNextHours, precipType)
  const jacketColor = JACKET_COLOURS[jacket]
  const JacketIcon = jacket === 'no' ? CheckCircle : Shirt

  return (
    <div className="verdict-card">

      {/* Route summary bar */}
      <div className="verdict-route-bar">
        <span className="route-stat"><Bike size={13} />{distanceKm.toFixed(1)} km</span>
        <span className="route-stat"><Clock size={13} />{Math.round(durationMin)} min</span>
        <span className="route-stat"><Route size={13} />{dominantSurface}</span>
        <span className="route-stat"><Thermometer size={13} />{currentTemp.toFixed(1)} °C</span>
      </div>

      {/* Reason — top of body as a highlighted summary */}
      <div className="verdict-summary">
        <CircleDot size={13} className="summary-icon" />
        <span>{slipperiness.reason}</span>
      </div>

      {/* Tyre rows */}
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

        {/* Jacket */}
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

        {/* Weather detail pills */}
        <div className="weather-pills">
          <span className="weather-pill">
            <Thermometer size={11} />
            low {overnightLow.toFixed(1)} °C tonight
          </span>
          {recentPrecipMm > 0.1 && (
            <span className="weather-pill">
              <PrecipIcon type={precipType} />
              {precipType} {recentPrecipMm.toFixed(1)} mm now
            </span>
          )}
          {rainNextHours > 0.1 && (
            <span className="weather-pill">
              <Droplets size={11} />
              {rainNextHours.toFixed(1)} mm next 3h
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
    </div>
  )
}
