import { useTranslation } from 'react-i18next'
import { Sun, Moon } from 'lucide-react'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onToggleLang: () => void
}

export function AppHeader({ theme, onToggleTheme, onToggleLang }: Props) {
  const { t } = useTranslation()
  return (
    <header className="app-header">
      <div className="header-title">
        <h1>slippery</h1>
        <p className="subtitle">{t('app.subtitle')}</p>
      </div>
      <div className="header-actions">
        <button className="lang-btn" onClick={onToggleLang}>{t('header.toggleLang')}</button>
        <button className="theme-btn" onClick={onToggleTheme} aria-label={t('header.toggleTheme')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
