import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, X, ArrowRight, LocateFixed, GripVertical } from 'lucide-react'
import { saveAddress, type SavedAddress } from '../../state'
import { geocodeReverse, isWithinNorway, type GeocodeSuggestion } from '../../api/ors'
import { useAddressField, useWaypointField } from './useGeocodeField'

export interface Waypoint {
  id: number
  label: string
  lat: number
  lng: number
}

export interface WaypointEntry { id: number; initial?: SavedAddress }

let _nextId = 1
export function getNextId() { return _nextId++ }

export function resolvedWaypoints(entries: WaypointEntry[], ref: Map<number, Waypoint>): Waypoint[] {
  return entries.map((w) => ref.get(w.id)).filter((w): w is Waypoint => !!w)
}

export function AddressField({
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

  const handleLocate = async () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          if (!isWithinNorway(pos.coords.latitude, pos.coords.longitude)) {
            setLocating(false)
            return
          }
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
  }

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

export function WaypointField({
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
  const { value, suggestions, open, outOfBounds, handleInput, handleSelect, setOpen } =
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

export function CheckRouteButton({
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
