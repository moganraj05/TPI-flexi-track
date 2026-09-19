import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Production only — in dev this would fight Vite's own dev-server transforms
// and HMR for no benefit, since there's no hashed build output yet to shell-cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability/offline-shell is a progressive enhancement — the app
      // itself works the same without it, so a failed registration is silent.
    });
  });
}
