import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, X, ArrowRight, ArrowUpDown, LocateFixed, Plus } from 'lucide-react'
import { loadAddresses, saveAddress, clearAddress, saveWaypoints, type SavedAddress } from '../state'
import { geocodeAutocomplete, geocodeReverse, type GeocodeSuggestion } from '../api/ors'

export interface Waypoint {
  id: number
  label: string
  lat: number
  lng: number
}

interface Props {
  onCheck: (waypoints: Waypoint[]) => void
  loading: boolean
  cooldownUntil?: number
}

function useAddressField(field: 'from' | 'to', onSaved: () => void, overrideValue?: string) {
  const saved = loadAddresses()[field]
  const [value, setValue] = useState(saved?.label ?? '')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [])

  useEffect(() => {
    if (overrideValue !== undefined) setValue(overrideValue)
  }, [overrideValue])

  const handleInput = useCallback((text: string) => {
    setValue(text)
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
    saveAddress(field, { label: s.label, lat: s.lat, lng: s.lng })
    setSuggestions([])
    setOpen(false)
    onSaved()
  }, [field, onSaved])

  const handleClear = useCallback(() => {
    setValue('')
    clearAddress(field)
    setSuggestions([])
    setOpen(false)
    onSaved()
  }, [field, onSaved])

  return { value, setValue, suggestions, open, handleInput, handleSelect, handleClear, setOpen }
}

function useWaypointField(onSaved: () => void, initialLabel = '') {
  const [value, setValue] = useState(initialLabel)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [])

  const handleInput = useCallback((text: string) => {
    setValue(text)
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
    setSuggestions([])
    setOpen(false)
    onSaved()
    return s
  }, [onSaved])

  return { value, setValue, suggestions, open, handleInput, handleSelect, setOpen }
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
  const { value, setValue, suggestions, open, handleInput, handleSelect, handleClear, setOpen } =
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
      <div className="input-wrap">
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
            aria-label="Use current location"
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? <span className="locate-spinner" /> : <LocateFixed size={13} />}
          </button>
        )}
        {value && (
          <button type="button" className="clear-btn" aria-label="Clear" onClick={handleClear}>
            <X size={13} />
          </button>
        )}
      </div>
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
}: {
  id: number
  onResolved: (id: number, s: GeocodeSuggestion) => void
  onRemove: (id: number) => void
  initialValue?: SavedAddress
}) {
  const { t } = useTranslation()
  const handleSaved = useCallback(() => {}, [])
  const { value, setValue, suggestions, open, handleInput, handleSelect, setOpen } =
    useWaypointField(handleSaved, initialValue?.label)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [setOpen])

  return (
    <div className="field waypoint-field" ref={wrapRef}>
      <div className="waypoint-label-row">
        <span className="field-label">{t('form.via')}</span>
        <button type="button" className="waypoint-remove-btn" aria-label="Remove waypoint" onClick={() => onRemove(id)}>
          <X size={11} />
        </button>
      </div>
      <div className="input-wrap">
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
      {open && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li
              key={`${s.lat},${s.lng}`}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(s)
                onResolved(id, s)
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
}: {
  loading: boolean
  canCheck: boolean
  cooldownUntil?: number
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now())
  const onCooldown = cooldownUntil != null && now < cooldownUntil
  const remaining = onCooldown ? Math.ceil((cooldownUntil! - now) / 1000) : 0

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
          : t('form.checkRoute')}
    </button>
  )
}

export function AddressForm({ onCheck, loading, cooldownUntil }: Props) {
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
  const waypointsRef = useRef<Map<number, Waypoint>>(new Map())

  // Pre-populate ref from saved waypoints on mount
  useEffect(() => {
    const saved = loadAddresses().waypoints
    waypoints.forEach((entry, i) => {
      const w = saved[i]
      if (w) waypointsRef.current.set(entry.id, { id: entry.id, ...w })
    })
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshCanCheck = useCallback(() => {
    const { from, to } = loadAddresses()
    setCanCheck(!!from && !!to)
  }, [])

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
    saveWaypoints(
      Array.from(waypointsRef.current.values()),
    )
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!loading && canCheck) {
      const resolved = waypoints
        .map((w) => waypointsRef.current.get(w.id))
        .filter((w): w is Waypoint => w !== undefined)
      onCheck(resolved)
    }
  }

  return (
    <form id="route-form" onSubmit={handleSubmit}>
      <div className="fields">
        <AddressField
          label={t('form.from')}
          placeholder={t('form.placeholderFrom')}
          field="from"
          onSaved={refreshCanCheck}
          overrideValue={fromOverride}
          showLocate
        />

        {waypoints.map((entry) => (
          <WaypointField
            key={entry.id}
            id={entry.id}
            onResolved={resolveWaypoint}
            onRemove={removeWaypoint}
            initialValue={entry.initial}
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
      <div className="form-actions">
        <button type="button" className="swap-btn" onClick={handleSwap} aria-label={t('form.swap')} title={t('form.swap')}>
          <ArrowUpDown size={14} />
        </button>
        <CheckRouteButton loading={loading} canCheck={canCheck} cooldownUntil={cooldownUntil} />
      </div>
    </form>
  )
}
