import type { ReactNode } from 'react'
import styles from './Tabs.module.scss'
import { cx } from '../cx'

export interface TabOption<T extends string> {
  value: T
  label: ReactNode
}

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: TabOption<T>[]
  variant?: 'compact' | 'full'
  className?: string
}

export function Tabs<T extends string>({
  value, onChange, options, variant = 'compact', className,
}: Props<T>) {
  return (
    <div className={cx(styles.tabs, styles[`tabs--${variant}`], className)} role="group">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            className={cx(styles.tab, styles[`tab--${variant}`], active && styles.active)}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
