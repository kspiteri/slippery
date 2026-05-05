import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, X, ArrowRight, ArrowUpDown } from 'lucide-react'
import { loadAddresses, saveAddress, clearAddress, type SavedAddress } from '../state'
import { geocodeAutocomplete, type GeocodeSuggestion } from '../api/ors'

interface Props {
  onCheck: () => void
  loading: boolean
}

function useAddressField(field: 'from' | 'to', onSaved: () => void, overrideValue?: string) {
  const saved = loadAddresses()[field]
  const [value, setValue] = useState(saved?.label ?? '')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // allow parent to push a new value in (used by swap)
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

  return { value, suggestions, open, handleInput, handleSelect, handleClear, setOpen }
}

function AddressField({
  label,
  placeholder,
  field,
  onSaved,
  overrideValue,
}: {
  label: string
  placeholder: string
  field: 'from' | 'to'
  onSaved: () => void
  overrideValue?: string
}) {
  const { value, suggestions, open, handleInput, handleSelect, handleClear, setOpen } =
    useAddressField(field, onSaved, overrideValue)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [setOpen])

  return (
    <div className="field" ref={wrapRef}>
      <span className="field-label">{label}</span>
      <div className="input-wrap">
        <span className="input-icon">
          <MapPin size={14} />
        </span>
        <input
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        {value && (
          <button type="button" className="clear-btn" aria-label="Clear" onClick={handleClear}>
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li key={s.label} onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AddressForm({ onCheck, loading }: Props) {
  const [canCheck, setCanCheck] = useState(() => {
    const { from, to } = loadAddresses()
    return !!from && !!to
  })
  // swapKey forces AddressField to re-read labels from storage after a swap
  const [fromOverride, setFromOverride] = useState<string | undefined>()
  const [toOverride, setToOverride] = useState<string | undefined>()

  const refreshCanCheck = useCallback(() => {
    const { from, to } = loadAddresses()
    setCanCheck(!!from && !!to)
  }, [])

  const handleSwap = useCallback(() => {
    const { from, to } = loadAddresses()
    if (!from && !to) return
    // swap in storage
    if (to) { saveAddress('from', to) } else { clearAddress('from') }
    if (from) { saveAddress('to', from) } else { clearAddress('to') }
    // push new labels into inputs
    setFromOverride(to?.label ?? '')
    setToOverride(from?.label ?? '')
    refreshCanCheck()
  }, [refreshCanCheck])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!loading && canCheck) onCheck()
  }

  return (
    <form id="route-form" onSubmit={handleSubmit}>
      <div className="fields">
        <AddressField
          label="from"
          placeholder="home address"
          field="from"
          onSaved={refreshCanCheck}
          overrideValue={fromOverride}
        />
        <div className="swap-row">
          <button type="button" className="swap-btn" onClick={handleSwap} aria-label="Swap addresses">
            <ArrowUpDown size={14} />
          </button>
        </div>
        <AddressField
          label="to"
          placeholder="work address"
          field="to"
          onSaved={refreshCanCheck}
          overrideValue={toOverride}
        />
      </div>
      <button type="submit" id="go-btn" disabled={loading || !canCheck}>
        <ArrowRight size={15} />
        {loading ? 'checking…' : 'check route'}
      </button>
    </form>
  )
}
