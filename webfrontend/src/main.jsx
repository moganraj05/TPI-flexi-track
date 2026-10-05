import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Chrome/Edge/Android fire this once, early in page load, when the site can
// be installed as an app. Kept here (not inside a React component) so it is
// never missed; the Profile screen's "Install FlexiTrack" card picks it up.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.__ftInstallPrompt = event
  window.dispatchEvent(new Event('ft-install-available'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker serves the installable app shell and receives push
// notifications. In dev it is registered with ?dev=1, which turns its
// caching off (it would fight Vite's hot reload) but keeps push working, so
// notifications can be tested on http://localhost.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.PROD ? '/sw.js' : '/sw.js?dev=1').catch(() => {
      // Install/offline/push are progressive enhancements — the app itself
      // works the same without them, so a failed registration is silent.
    })
  })
}
