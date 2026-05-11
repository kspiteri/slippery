import { useState, useRef, useEffect, useCallback } from 'react'
import { geocodeAutocomplete, isWithinNorway, type GeocodeSuggestion } from '../../api/ors'
import { loadAddresses, saveAddress, clearAddress } from '../../state'

export function useAddressField(field: 'from' | 'to', onSaved: () => void, overrideValue?: string) {
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

export function useWaypointField(initialLabel = '') {
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
