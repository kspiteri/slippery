import type { ReactNode } from 'react'
import styles from './SegmentedToggle.module.scss'
import { cx } from '../cx'

export interface SegmentedToggleOption<T extends string> {
  value: T
  label: ReactNode
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
  return (
    <div className={cx(styles.group, className)} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            className={cx(styles.option, active && styles.active)}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
