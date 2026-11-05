
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { registerSW } from 'virtual:pwa-register'
import ActionToastViewport from './components/common/ActionToastViewport.jsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('The portal root element is missing.')
}

const root = createRoot(rootElement)
const renderStartupScreen = (error) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <section
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-lg"
    >
      {error ? (
        <>
          <h1 className="text-xl font-bold text-slate-900">Unable to load the portal</h1>
          <p className="mt-3 text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white hover:bg-blue-900"
          >
            Reload portal
          </button>
        </>
      ) : (
        <p className="text-sm font-medium text-slate-600">Loading AMCOMS…</p>
      )}
    </section>
  </main>
)

root.render(renderStartupScreen())

const portalMode =
  import.meta.env.VITE_PORTAL_MODE || import.meta.env.MODE
const isStaffRoute =
  /^\/(?:login\/staff|staff)(?:\/|$)/.test(window.location.pathname)
const loadApp =
  portalMode === 'staff' || isStaffRoute
    ? import('./staff/StaffApp.jsx')
    : import('./App.jsx')

loadApp.then(({ default: App }) => {
  root.render(
    <StrictMode>
      <>
        <App />
        <ActionToastViewport />
      </>
    </StrictMode>,
  )
}).catch((error) => {
  console.error('Unable to start the AMCOMS portal:', error)
  root.render(
    renderStartupScreen(error instanceof Error ? error.message : 'An unexpected startup error occurred.')
  )
})

registerSW()
