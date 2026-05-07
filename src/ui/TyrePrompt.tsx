import { useTranslation } from 'react-i18next'
import type { TyrePref } from '../state'

interface Props {
  onChoose: (pref: TyrePref) => void
}

export function TyrePrompt({ onChoose }: Props) {
  const { t } = useTranslation()
  return (
    <div className="card tyre-prompt">
      <div className="tyre-prompt-heading">{t('tyrePrompt.heading')}</div>
      <p className="tyre-prompt-body">{t('tyrePrompt.body')}</p>
      <div className="tyre-prompt-actions">
        <button type="button" onClick={() => onChoose('normal')}>
          {t('tyrePrompt.normal')}
        </button>
        <button type="button" onClick={() => onChoose('studded')}>
          {t('tyrePrompt.studded')}
        </button>
      </div>
    </div>
  )
}
