import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, X, ArrowRight, LocateFixed, GripVertical } from 'lucide-react'
import { saveAddress, type SavedAddress } from '../../state'
import { geocodeReverse, isWithinNorway, type GeocodeSuggestion } from '../../api/ors'
import { Button } from '../primitives/Button'
import { TextField } from '../primitives/TextField'
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

  const handleLocate = async () => {
    if (!navigator.geolocation) return
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            if (!isWithinNorway(pos.coords.latitude, pos.coords.longitude)) return resolve()
            const result = await geocodeReverse(pos.coords.latitude, pos.coords.longitude)
            if (result) {
              setValue(result.label)
              saveAddress(field, { label: result.label, lat: result.lat, lng: result.lng })
              onSaved()
            }
          } finally { resolve() }
        },
        () => resolve(),
        { timeout: 8000 },
      )
    })
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <TextField
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onValueChange={handleInput}
        icon={<MapPin size={14} />}
        error={outOfBounds ? t('error.outsideNorway') : undefined}
        suggestions={suggestions}
        suggestionsOpen={open}
        getSuggestionKey={(s) => `${s.lat},${s.lng}`}
        getSuggestionLabel={(s) => s.label}
        onSelectSuggestion={handleSelect}
        onSuggestionsClose={() => setOpen(false)}
        onLocate={showLocate ? handleLocate : undefined}
        locateIcon={<LocateFixed size={13} />}
        locateLabel={t('form.useLocation')}
        onClear={value ? handleClear : undefined}
        clearIcon={<X size={13} />}
        clearLabel={t('form.clear')}
      />
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

  return (
    <div
      className={`field waypoint-field${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="waypoint-label-row">
        <span className="waypoint-drag-handle"><GripVertical size={13} /></span>
        <span className="field-label">{t('form.via')}</span>
        <Button variant="cancel" aria-label={t('form.removeWaypoint')} onClick={() => onRemove(id)}>
          <X size={11} />
        </Button>
      </div>
      <TextField
        type="text"
        autoComplete="off"
        placeholder={t('form.placeholderWaypoint')}
        value={value}
        onValueChange={handleInput}
        icon={<MapPin size={14} />}
        error={outOfBounds ? t('error.outsideNorway') : undefined}
        suggestions={suggestions}
        suggestionsOpen={open}
        getSuggestionKey={(s) => `${s.lat},${s.lng}`}
        getSuggestionLabel={(s) => s.label}
        onSelectSuggestion={(s) => {
          const resolved = handleSelect(s)
          if (resolved) onResolved(id, resolved)
        }}
        onSuggestionsClose={() => setOpen(false)}
      />
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
    <Button type="submit" variant="primary" disabled={loading || !canCheck || onCooldown}>
      <ArrowRight size={15} />
      {loading
        ? t('form.checking')
        : onCooldown
          ? t('form.recentlyCheckedIn', { sec: remaining })
          : hasPreview
            ? t('form.refetchRoute')
            : t('form.checkRoute')}
    </Button>
  )
}
