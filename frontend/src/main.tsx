import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Imported for its side effect: i18next must be initialised before any component that calls
// t() renders, so this has to sit above <App>.
import './lib/i18n'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
