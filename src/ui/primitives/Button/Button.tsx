import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.scss'

type Variant = 'primary' | 'secondary' | 'cancel'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function Button({ variant = 'secondary', className, type = 'button', children, ...rest }: Props) {
  const composed = [styles.button, styles[variant], className].filter(Boolean).join(' ')
  return (
    <button type={type} className={composed} {...rest}>
      {children}
    </button>
  )
}
