import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, Clock, History } from 'lucide-react'
import type { RouteState } from '../../App'
import type { RouteSegment } from '../../api/ors'
import type { TyrePref } from '../../state'
import { surfaceColour } from '../../logic/surfaces'
import { ElevationProfile } from './ElevationProfile'
import { RouteMap } from '../RouteMap'
import { Tabs } from '../primitives/Tabs'
import { VerdictPanel, SurfaceBar, StatusBadge, VerdictHero, AlertBanner } from './VerdictPanel'

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

function TabLabel({ text, alert }: { text: string; alert: boolean }) {
  return (
    <span className="tab-label">
      {text}
      {alert && <span className="tab-alert-dot" aria-hidden />}
    </span>
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

      <VerdictHero risk={tyrePref === 'studded' ? active.slipperiness.studdedRisk : active.slipperiness.normalRisk} />

      <AlertBanner data={active} />

      <Tabs<'elevation' | 'map'>
        value={profileTab}
        onChange={setProfileTab}
        options={[
          { value: 'elevation', label: t('verdict.tabElevation') },
          { value: 'map', label: t('verdict.tabMap') },
        ]}
        variant="compact"
      />
      {profileTab === 'elevation'
        ? <ElevationProfile coordinates={coordinates} showSampleMarkers={multiPoint} color={surfaceColour(active.dominantSurface)} />
        : <RouteMap coordinates={coordinates} segments={segments} />
      }

      <SurfaceBar counts={now.surfaceCounts} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'now', label: <TabLabel text={t('verdict.tabNow')} alert={now.hasIceAlert} /> },
          { value: 'plus2h', label: <TabLabel text={t('verdict.tabPlus2h')} alert={plus2h.hasIceAlert} /> },
          { value: 'plus8h', label: <TabLabel text={t('verdict.tabPlus8h')} alert={plus8h.hasIceAlert} /> },
        ]}
        variant="full"
      />

      <VerdictPanel data={active} tab={tab} tyrePref={tyrePref} onChangeTyrePref={onChangeTyrePref} />
    </div>
  )
}
