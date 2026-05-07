import { useTranslation } from 'react-i18next'
import { Sun, Moon, Maximize2, Minimize2 } from 'lucide-react'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onToggleLang: () => void
  focusMode?: boolean
  onToggleFocus?: () => void
  canFocus?: boolean
}

export function AppHeader({ theme, onToggleTheme, onToggleLang, focusMode, onToggleFocus, canFocus }: Props) {
  const { t } = useTranslation()
  return (
    <header className="app-header">
      <div className="header-title">
        <h1>slippery</h1>
        <p className="subtitle">{t('app.subtitle')}</p>
      </div>
      <div className="header-actions">
        {canFocus && onToggleFocus && (
          <button
            className="focus-btn"
            onClick={onToggleFocus}
            aria-label={focusMode ? t('header.exitFocus') : t('header.enterFocus')}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        <button className="lang-btn" onClick={onToggleLang}>{t('header.toggleLang')}</button>
        <button className="theme-btn" onClick={onToggleTheme} aria-label={t('header.toggleTheme')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
