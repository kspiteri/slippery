import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Sun, Moon } from 'lucide-react'
import { Button } from './primitives/Button'
import { fontScaleToPercent, MIN_FONT_SCALE, MAX_FONT_SCALE, type FontScale } from '../state'
import type { Theme } from '../App'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onToggleLang: () => void
  fontScale: FontScale
  onAdjustFontScale: (delta: 1 | -1) => void
}

export function SettingsMenu({ theme, onToggleTheme, onToggleLang, fontScale, onAdjustFontScale }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="settings-menu" ref={wrapRef}>
      <Button onClick={() => setOpen((v) => !v)} aria-label={t('header.settings')} title={t('header.settings')}>
        <Settings size={16} />
      </Button>
      {open && (
        <div className="settings-popover" role="menu">
          <div className="settings-row">
            <span className="settings-row-label">{t('settings.theme')}</span>
            <Button onClick={onToggleTheme} aria-label={t('header.toggleTheme')}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">{t('settings.language')}</span>
            <Button onClick={onToggleLang}>{t('header.toggleLang')}</Button>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">{t('settings.fontSize')}</span>
            <div className="font-size-controls">
              <Button
                onClick={() => onAdjustFontScale(-1)}
                disabled={fontScale === MIN_FONT_SCALE}
                aria-label={t('settings.fontSizeDecrease')}
              >
                A−
              </Button>
              <span className="font-size-value">{fontScaleToPercent(fontScale)}%</span>
              <Button
                onClick={() => onAdjustFontScale(1)}
                disabled={fontScale === MAX_FONT_SCALE}
                aria-label={t('settings.fontSizeIncrease')}
              >
                A+
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
