import type { ReactNode } from 'react'
import styles from './SegmentedToggle.module.scss'

export interface SegmentedToggleOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedToggleOption<T>[]
  ariaLabel?: string
  className?: string
}

export function SegmentedToggle<T extends string>({
  value, onChange, options, ariaLabel, className,
}: Props<T>) {
  const groupClass = [styles.group, className].filter(Boolean).join(' ')
  return (
    <div className={groupClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            className={`${styles.option}${active ? ` ${styles.active}` : ''}`}
            onClick={() => onChange(opt.value)}
            title={opt.title}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
