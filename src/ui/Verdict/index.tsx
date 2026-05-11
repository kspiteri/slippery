import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, Clock, History } from 'lucide-react'
import type { RouteState } from '../../App'
import type { RouteSegment } from '../../api/ors'
import type { TyrePref } from '../../state'
import { surfaceColour } from '../../logic/surfaces'
import { ElevationProfile } from './ElevationProfile'
import { RouteMap } from '../RouteMap'
import { VerdictPanel, SurfaceBar, StatusBadge } from './VerdictPanel'

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
