import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from './primitives/Button'
import { SettingsMenu } from './SettingsMenu'
import type { FontScale } from '../state'
import type { Theme } from '../App'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onToggleLang: () => void
  fontScale: FontScale
  onAdjustFontScale: (delta: 1 | -1) => void
  focusMode?: boolean
  onToggleFocus?: () => void
  canFocus?: boolean
}

export function AppHeader({
  theme, onToggleTheme, onToggleLang,
  fontScale, onAdjustFontScale,
  focusMode, onToggleFocus, canFocus,
}: Props) {
  const { t } = useTranslation()
  return (
    <header className="app-header">
      <div className="header-title">
        <h1>slippery</h1>
      </div>
      <div className="header-actions">
        {canFocus && onToggleFocus && (
          <Button
            onClick={onToggleFocus}
            aria-label={focusMode ? t('header.exitFocus') : t('header.enterFocus')}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
        )}
        <SettingsMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          onToggleLang={onToggleLang}
          fontScale={fontScale}
          onAdjustFontScale={onAdjustFontScale}
        />
      </div>
    </header>
  )
}
