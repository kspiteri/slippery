import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './i18n'
import { App } from './App'
import { initAsciiResize } from './ui/ascii'

initAsciiResize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
