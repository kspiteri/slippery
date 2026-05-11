import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Plus, Bookmark, X, ArrowRight, Upload } from 'lucide-react'
import { loadAddresses, saveAddress, clearAddress, saveWaypoints } from '../../state'
import { geocodeReverse, type RouteResult, type GeocodeSuggestion } from '../../api/ors'
import { RouteMap } from '../RouteMap'
import { parseGeoFile } from '../../logic/parseGeoFile'
import {
  AddressField, WaypointField, CheckRouteButton,
  resolvedWaypoints, getNextId,
  type Waypoint, type WaypointEntry,
} from './AddressFieldComponents'

export type { Waypoint }

interface Props {
  onFetchRoute: (waypoints: Waypoint[]) => void
  onConfirm: (waypoints: Waypoint[]) => void
  onAddressChange: () => void
  routePreview: RouteResult | null
  loading: boolean
  cooldownUntil?: number
  onSaveRoute?: (name: string) => 'ok' | 'limit' | 'error'
  canSave?: boolean
  onImportRoute?: (coords: [number, number][]) => void
}

export function AddressForm({ onFetchRoute, onConfirm, onAddressChange, routePreview, loading, cooldownUntil, onSaveRoute, canSave, onImportRoute }: Props) {
  const { t } = useTranslation()
  const [canCheck, setCanCheck] = useState(() => {
    const { from, to } = loadAddresses()
    return !!from && !!to
  })
  const [fromOverride, setFromOverride] = useState<string | undefined>()
  const [toOverride, setToOverride] = useState<string | undefined>()
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>(() => {
    const saved = loadAddresses().waypoints
    return saved.map((w) => ({ id: getNextId(), initial: w }))
  })
  const waypointsRef = useRef<Map<number, Waypoint>>(null!)
  if (!waypointsRef.current) {
    const map = new Map<number, Waypoint>()
    waypoints.forEach((entry) => {
      if (entry.initial) map.set(entry.id, { id: entry.id, ...entry.initial })
    })
    waypointsRef.current = map
  }
  const [savingRoute, setSavingRoute] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (savingRoute) nameInputRef.current?.focus()
  }, [savingRoute])

  const refreshCanCheck = useCallback(() => {
    const { from, to } = loadAddresses()
    setCanCheck(!!from && !!to)
    onAddressChange()
  }, [onAddressChange])

  useEffect(() => {
    const { from } = loadAddresses()
    if (from || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await geocodeReverse(pos.coords.latitude, pos.coords.longitude)
          if (result) {
            saveAddress('from', { label: result.label, lat: result.lat, lng: result.lng })
            setFromOverride(result.label)
            refreshCanCheck()
          }
        } catch { /* silent */ }
      },
      () => {},
      { timeout: 8000 },
    )
  }, [refreshCanCheck])

  const handleSwap = useCallback(() => {
    const { from, to } = loadAddresses()
    if (!from && !to) return
    if (to) { saveAddress('from', to) } else { clearAddress('from') }
    if (from) { saveAddress('to', from) } else { clearAddress('to') }
    setFromOverride(to?.label ?? '')
    setToOverride(from?.label ?? '')
    refreshCanCheck()
  }, [refreshCanCheck])

  const addWaypoint = useCallback(() => {
    setWaypoints((prev) => [...prev, { id: getNextId() }])
  }, [])

  const removeWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => {
      const next = prev.filter((w) => w.id !== id)
      waypointsRef.current.delete(id)
      saveWaypoints(resolvedWaypoints(next, waypointsRef.current))
      return next
    })
  }, [])

  const resolveWaypoint = useCallback((id: number, s: GeocodeSuggestion) => {
    waypointsRef.current.set(id, { id, label: s.label, lat: s.lat, lng: s.lng })
    setWaypoints((prev) => {
      saveWaypoints(resolvedWaypoints(prev, waypointsRef.current))
      return prev
    })
  }, [])

  const reorderWaypoints = useCallback((fromIndex: number, toIndex: number) => {
    setWaypoints((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      saveWaypoints(resolvedWaypoints(next, waypointsRef.current))
      return next
    })
  }, [])

  const handleMapClick = useCallback((lat: number, lng: number, label: string) => {
    const id = getNextId()
    waypointsRef.current.set(id, { id, label, lat, lng })
    setWaypoints((prev) => {
      const next = [...prev, { id, initial: { label, lat, lng } }]
      saveWaypoints(resolvedWaypoints(next, waypointsRef.current))
      return next
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!loading && canCheck) onFetchRoute(resolvedWaypoints(waypoints, waypointsRef.current))
  }

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImportRoute) return
    e.target.value = ''
    try {
      const coords = await parseGeoFile(file)
      if (coords.length >= 2) onImportRoute(coords)
    } catch { /* silent — bad file format */ }
  }, [onImportRoute])

  const handleSaveClick = useCallback(() => {
    const { from, to } = loadAddresses()
    const defaultName = from && to
      ? `${from.label.split(',')[0]} → ${to.label.split(',')[0]}`
      : ''
    setRouteName(defaultName)
    setSaveError(null)
    setSavingRoute(true)
  }, [])

  const handleSaveConfirm = useCallback(() => {
    if (!onSaveRoute || !routeName.trim()) return
    const result = onSaveRoute(routeName.trim())
    if (result === 'ok') {
      setSavingRoute(false)
      setRouteName('')
      setSaveError(null)
    } else if (result === 'limit') {
      setSaveError(t('savedRoutes.limitReached'))
    } else {
      setSaveError(t('savedRoutes.error'))
    }
  }, [onSaveRoute, routeName, t])

  const handleSaveCancel = useCallback(() => {
    setSavingRoute(false)
    setRouteName('')
    setSaveError(null)
  }, [])

  return (
    <form id="route-form" className="card" onSubmit={handleSubmit}>
      <div className="fields">
        <AddressField
          label={t('form.from')}
          placeholder={t('form.placeholderFrom')}
          field="from"
          onSaved={refreshCanCheck}
          overrideValue={fromOverride}
          showLocate
        />

        {waypoints.map((entry, index) => (
          <WaypointField
            key={entry.id}
            id={entry.id}
            onResolved={resolveWaypoint}
            onRemove={removeWaypoint}
            initialValue={entry.initial}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index) }}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) reorderWaypoints(dragIndex, index)
              setDragIndex(null)
              setDragOverIndex(null)
            }}
            isDragging={dragIndex === index}
            isDragOver={dragOverIndex === index && dragIndex !== index}
          />
        ))}

        <div className="waypoint-add-row">
          <button type="button" className="waypoint-add-btn" onClick={addWaypoint}>
            <Plus size={12} />
            {t('form.addWaypoint')}
          </button>
        </div>

        <AddressField
          label={t('form.to')}
          placeholder={t('form.placeholderTo')}
          field="to"
          onSaved={refreshCanCheck}
          overrideValue={toOverride}
        />
      </div>

      {savingRoute && (
        <div className="save-route-row">
          <input
            ref={nameInputRef}
            type="text"
            className="save-route-input"
            placeholder={t('savedRoutes.namePlaceholder')}
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSaveConfirm() }
              if (e.key === 'Escape') handleSaveCancel()
            }}
          />
          <button type="button" className="save-route-confirm" onClick={handleSaveConfirm} disabled={!routeName.trim()}>
            {t('savedRoutes.confirm')}
          </button>
          <button type="button" className="save-route-cancel" onClick={handleSaveCancel}>
            <X size={12} />
          </button>
          {saveError && <span className="save-route-error">{saveError}</span>}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="swap-btn" onClick={handleSwap} aria-label={t('form.swap')} title={t('form.swap')}>
          <ArrowUpDown size={14} />
        </button>
        {canSave && onSaveRoute && !savingRoute && (
          <button type="button" className="save-route-btn" onClick={handleSaveClick} title={t('savedRoutes.save')}>
            <Bookmark size={14} />
          </button>
        )}
        {onImportRoute && (
          <input
            ref={importInputRef}
            type="file"
            accept=".gpx,.geojson,.json,.kml"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        )}
        {onImportRoute && (
          <button
            type="button"
            className="save-route-btn"
            onClick={() => importInputRef.current?.click()}
            title={t('form.importRoute')}
          >
            <Upload size={14} />
          </button>
        )}
        <CheckRouteButton loading={loading} canCheck={canCheck} cooldownUntil={cooldownUntil} hasPreview={routePreview !== null} />
      </div>

      {routePreview && (
        <div className="route-preview">
          <div className="route-preview-stats">
            <span>{routePreview.distanceKm.toFixed(1)} km</span>
            <span>{Math.round(routePreview.durationMin)} min</span>
          </div>
          <RouteMap coordinates={routePreview.coordinates} segments={routePreview.segments} onMapClick={handleMapClick} />
          <button
            type="button"
            className="route-preview-confirm"
            onClick={() => onConfirm(resolvedWaypoints(waypoints, waypointsRef.current))}
          >
            <ArrowRight size={14} />
            {t('form.confirmConditions')}
          </button>
        </div>
      )}
    </form>
  )
}
