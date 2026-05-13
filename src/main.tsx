import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.scss'
import './i18n'
import { App } from './App'
import { initMapResize } from './ui/mapBackground'

initMapResize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
