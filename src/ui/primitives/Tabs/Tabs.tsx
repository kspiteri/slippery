import type { ReactNode } from 'react'
import styles from './Tabs.module.scss'

export interface TabOption<T extends string> {
  value: T
  label: ReactNode
}

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: TabOption<T>[]
  variant?: 'compact' | 'full'
  ariaLabel?: string
  className?: string
}

export function Tabs<T extends string>({
  value, onChange, options, variant = 'compact', ariaLabel, className,
}: Props<T>) {
  const tabsClass = [
    styles.tabs,
    styles[`tabs--${variant}`],
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={tabsClass} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        const tabClass = [
          styles.tab,
          styles[`tab--${variant}`],
          active && styles.active,
        ].filter(Boolean).join(' ')
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={tabClass}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
