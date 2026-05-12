import { useEffect, useRef, useState, type ReactNode, type Ref, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.scss'

interface Props<T> extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
  wrapClassName?: string
  icon?: ReactNode
  onClear?: () => void
  clearIcon?: ReactNode
  clearLabel?: string
  onLocate?: () => Promise<void> | void
  locateIcon?: ReactNode
  locateLabel?: string
  error?: string
  alwaysFocused?: boolean
  suggestions?: T[]
  suggestionsOpen?: boolean
  getSuggestionKey?: (s: T) => string
  getSuggestionLabel?: (s: T) => string
  onSelectSuggestion?: (s: T) => void
  onSuggestionsClose?: () => void
}

export function TextField<T>({
  value,
  onValueChange,
  inputRef,
  wrapClassName,
  icon,
  onClear,
  clearIcon,
  clearLabel,
  onLocate,
  locateIcon,
  locateLabel,
  error,
  alwaysFocused,
  suggestions,
  suggestionsOpen,
  getSuggestionKey,
  getSuggestionLabel,
  onSelectSuggestion,
  onSuggestionsClose,
  onKeyDown,
  ...inputProps
}: Props<T>) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!suggestionsOpen || !onSuggestionsClose) return
    const close = onSuggestionsClose
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [suggestionsOpen, onSuggestionsClose])

  const handleLocate = async () => {
    if (!onLocate) return
    setLocating(true)
    try { await onLocate() } finally { setLocating(false) }
  }

  const inputClass = [
    styles.input,
    error && styles['input--error'],
    alwaysFocused && styles['input--focused'],
  ].filter(Boolean).join(' ')

  return (
    <div className={[styles.wrap, wrapClassName].filter(Boolean).join(' ')} ref={wrapRef}>
      <div className={inputClass}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          {...inputProps}
          ref={inputRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onSuggestionsClose?.()
            onKeyDown?.(e)
          }}
        />
        {onLocate && (
          <button
            type="button"
            className={`${styles.adornment} ${styles['adornment--locate']}`}
            aria-label={locateLabel}
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? <span className={styles.spinner} /> : locateIcon}
          </button>
        )}
        {onClear && value && (
          <button
            type="button"
            className={styles.adornment}
            aria-label={clearLabel}
            onClick={onClear}
          >
            {clearIcon}
          </button>
        )}
      </div>
      {error && <span className={styles.error}>{error}</span>}
      {suggestionsOpen && suggestions && suggestions.length > 0 && getSuggestionKey && getSuggestionLabel && (
        <ul className={styles.suggestions}>
          {suggestions.map((s) => (
            <li
              key={getSuggestionKey(s)}
              onMouseDown={(e) => { e.preventDefault(); onSelectSuggestion?.(s) }}
            >
              {getSuggestionLabel(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
