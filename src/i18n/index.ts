import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import no from './no'

const saved = localStorage.getItem('slippery_lang')
const detected = navigator.language.startsWith('no') ? 'no' : 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      no: { translation: no },
    },
    lng: saved ?? detected,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
