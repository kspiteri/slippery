import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, X, ArrowRight, ArrowUpDown, LocateFixed, Plus, Bookmark, GripVertical } from 'lucide-react'
import { loadAddresses, saveAddress, clearAddress, saveWaypoints, type SavedAddress } from '../state'
import { geocodeAutocomplete, geocodeReverse, isWithinNorway, type GeocodeSuggestion } from '../api/ors'
import type { RouteResult } from '../api/ors'
import { RouteMap } from './RouteMap'

export interface Waypoint {
  id: number
  label: string
  lat: number
  lng: number
}

interface Props {
  onFetchRoute: (waypoints: Waypoint[]) => void
  onConfirm: (waypoints: Waypoint[]) => void
  onAddressChange: () => void
  routePreview: RouteResult | null
  loading: boolean
  cooldownUntil?: number
  onSaveRoute?: (name: string) => 'ok' | 'limit' | 'error'
  canSave?: boolean
}

function useAddressField(field: 'from' | 'to', onSaved: () => void, overrideValue?: string) {
  const saved = loadAddresses()[field]
  const [value, setValue] = useState(saved?.label ?? '')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [outOfBounds, setOutOfBounds] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [])

  useEffect(() => {
    if (overrideValue !== undefined) setValue(overrideValue)
  }, [overrideValue])

  const handleInput = useCallback((text: string) => {
    setValue(text)
    setOutOfBounds(false)
    if (debounce.current) clearTimeout(debounce.current)
    if (text.length < 3) { setSuggestions([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      try {
        const results = await geocodeAutocomplete(text)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch {
        setOpen(false)
      }
    }, 300)
  }, [])

  const handleSelect = useCallback((s: GeocodeSuggestion) => {
    if (!isWithinNorway(s.lat, s.lng)) {
      setValue(s.label)
      setOutOfBounds(true)
      setSuggestions([])
      setOpen(false)
      return
    }
    setValue(s.label)
    setOutOfBounds(false)
    saveAddress(field, { label: s.label, lat: s.lat, lng: s.lng })
    setSuggestions([])
    setOpen(false)
    onSaved()
  }, [field, onSaved])

  const handleClear = useCallback(() => {
    setValue('')
    setOutOfBounds(false)
    clearAddress(field)
    setSuggestions([])
    setOpen(false)
    onSaved()
  }, [field, onSaved])

  return { value, setValue, suggestions, open, outOfBounds, handleInput, handleSelect, handleClear, setOpen }
}

function useWaypointField(initialLabel = '') {
  const [value, setValue] = useState(initialLabel)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [outOfBounds, setOutOfBounds] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [])

  const handleInput = useCallback((text: string) => {
    setValue(text)
    setOutOfBounds(false)
    if (debounce.current) clearTimeout(debounce.current)
    if (text.length < 3) { setSuggestions([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      try {
        const results = await geocodeAutocomplete(text)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch {
        setOpen(false)
      }
    }, 300)
  }, [])

  const handleSelect = useCallback((s: GeocodeSuggestion) => {
    setValue(s.label)
    if (!isWithinNorway(s.lat, s.lng)) {
      setOutOfBounds(true)
      setSuggestions([])
      setOpen(false)
      return null
    }
    setOutOfBounds(false)
    setSuggestions([])
    setOpen(false)
    return s
  }, [])

  return { value, setValue, suggestions, open, outOfBounds, handleInput, handleSelect, setOpen }
}

function AddressField({
  label,
  placeholder,
  field,
  onSaved,
  overrideValue,
  showLocate,
}: {
  label: string
  placeholder: string
  field: 'from' | 'to'
  onSaved: () => void
  overrideValue?: string
  showLocate?: boolean
}) {
  const { t } = useTranslation()
  const { value, setValue, suggestions, open, outOfBounds, handleInput, handleSelect, handleClear, setOpen } =
    useAddressField(field, onSaved, overrideValue)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [setOpen])

  const handleLocate = useCallback(async () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          if (!isWithinNorway(pos.coords.latitude, pos.coords.longitude)) return
          const result = await geocodeReverse(pos.coords.latitude, pos.coords.longitude)
          if (result) {
            setValue(result.label)
            saveAddress(field, { label: result.label, lat: result.lat, lng: result.lng })
            onSaved()
          }
        } finally {
          setLocating(false)
        }
      },
      () => setLocating(false),
      { timeout: 8000 },
    )
  }, [field, onSaved, setValue])

  return (
    <div className="field" ref={wrapRef}>
      <span className="field-label">{label}</span>
      <div className={`input-wrap${outOfBounds ? ' input-wrap--error' : ''}`}>
        <span className="input-icon"><MapPin size={14} /></span>
        <input
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        {showLocate && (
          <button
            type="button"
            className={`locate-btn${locating ? ' locating' : ''}`}
            aria-label={t('form.useLocation')}
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? <span className="locate-spinner" /> : <LocateFixed size={13} />}
          </button>
        )}
        {value && (
          <button type="button" className="clear-btn" aria-label={t('form.clear')} onClick={handleClear}>
            <X size={13} />
          </button>
        )}
      </div>
      {outOfBounds && <span className="field-error">{t('error.outsideNorway')}</span>}
      {open && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li key={`${s.lat},${s.lng}`} onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WaypointField({
  id,
  onResolved,
  onRemove,
  initialValue,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragOver,
}: {
  id: number
  onResolved: (id: number, s: GeocodeSuggestion) => void
  onRemove: (id: number) => void
  initialValue?: SavedAddress
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  isDragging?: boolean
  isDragOver?: boolean
}) {
  const { t } = useTranslation()
  const { value, setValue, suggestions, open, outOfBounds, handleInput, handleSelect, setOpen } =
    useWaypointField(initialValue?.label)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [setOpen])

  return (
    <div
      className={`field waypoint-field${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
      ref={wrapRef}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="waypoint-label-row">
        <span className="waypoint-drag-handle"><GripVertical size={13} /></span>
        <span className="field-label">{t('form.via')}</span>
        <button type="button" className="waypoint-remove-btn" aria-label={t('form.removeWaypoint')} onClick={() => onRemove(id)}>
          <X size={11} />
        </button>
      </div>
      <div className={`input-wrap${outOfBounds ? ' input-wrap--error' : ''}`}>
        <span className="input-icon"><MapPin size={14} /></span>
        <input
          type="text"
          autoComplete="off"
          placeholder={t('form.placeholderWaypoint')}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        {value && (
          <button type="button" className="clear-btn" aria-label={t('form.clear')} onClick={() => setValue('')}>
            <X size={13} />
          </button>
        )}
      </div>
      {outOfBounds && <span className="field-error">{t('error.outsideNorway')}</span>}
      {open && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li
              key={`${s.lat},${s.lng}`}
              onMouseDown={(e) => {
                e.preventDefault()
                const resolved = handleSelect(s)
                if (resolved) onResolved(id, resolved)
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

let nextId = 1

interface WaypointEntry { id: number; initial?: SavedAddress }

function CheckRouteButton({
  loading,
  canCheck,
  cooldownUntil,
  hasPreview,
}: {
  loading: boolean
  canCheck: boolean
  cooldownUntil?: number
  hasPreview: boolean
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now())
  const remaining = cooldownUntil != null && now < cooldownUntil
    ? Math.ceil((cooldownUntil - now) / 1000)
    : 0
  const onCooldown = remaining > 0

  useEffect(() => {
    if (!onCooldown) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [onCooldown])

  return (
    <button type="submit" id="go-btn" disabled={loading || !canCheck || onCooldown}>
      <ArrowRight size={15} />
      {loading
        ? t('form.checking')
        : onCooldown
          ? t('form.recentlyCheckedIn', { sec: remaining })
          : hasPreview
            ? t('form.refetchRoute')
            : t('form.checkRoute')}
    </button>
  )
}

export function AddressForm({ onFetchRoute, onConfirm, onAddressChange, routePreview, loading, cooldownUntil, onSaveRoute, canSave }: Props) {
  const { t } = useTranslation()
  const [canCheck, setCanCheck] = useState(() => {
    const { from, to } = loadAddresses()
    return !!from && !!to
  })
  const [fromOverride, setFromOverride] = useState<string | undefined>()
  const [toOverride, setToOverride] = useState<string | undefined>()
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>(() => {
    const saved = loadAddresses().waypoints
    return saved.map((w) => ({ id: nextId++, initial: w }))
  })
  const waypointsRef = useRef<Map<number, Waypoint>>(null as unknown as Map<number, Waypoint>)
  if (waypointsRef.current === null) {
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
    setWaypoints((prev) => [...prev, { id: nextId++ }])
  }, [])

  const removeWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => {
      const next = prev.filter((w) => w.id !== id)
      waypointsRef.current.delete(id)
      saveWaypoints(
        next.map((w) => waypointsRef.current.get(w.id)).filter((w): w is Waypoint => !!w),
      )
      return next
    })
  }, [])

  const resolveWaypoint = useCallback((id: number, s: GeocodeSuggestion) => {
    waypointsRef.current.set(id, { id, label: s.label, lat: s.lat, lng: s.lng })
    setWaypoints((prev) => {
      saveWaypoints(
        prev.map((w) => waypointsRef.current.get(w.id)).filter((w): w is Waypoint => !!w),
      )
      return prev
    })
  }, [])

  const reorderWaypoints = useCallback((fromIndex: number, toIndex: number) => {
    setWaypoints((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      saveWaypoints(
        next.map((w) => waypointsRef.current.get(w.id)).filter((w): w is Waypoint => !!w),
      )
      return next
    })
  }, [])

  const handleMapClick = useCallback((lat: number, lng: number, label: string) => {
    const id = nextId++
    const waypoint: Waypoint = { id, label, lat, lng }
    waypointsRef.current.set(id, waypoint)
    setWaypoints((prev) => {
      const next = [...prev, { id, initial: { label, lat, lng } }]
      saveWaypoints(
        next.map((w) => waypointsRef.current.get(w.id)).filter((w): w is Waypoint => !!w),
      )
      return next
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!loading && canCheck) {
      const resolved = waypoints
        .map((w) => waypointsRef.current.get(w.id))
        .filter((w): w is Waypoint => w !== undefined)
      onFetchRoute(resolved)
    }
  }

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
            onClick={() => {
              const resolved = waypoints
                .map((w) => waypointsRef.current.get(w.id))
                .filter((w): w is Waypoint => w !== undefined)
              onConfirm(resolved)
            }}
          >
            <ArrowRight size={14} />
            {t('form.confirmConditions')}
          </button>
        </div>
      )}
    </form>
  )
}
