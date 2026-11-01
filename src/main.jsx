
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { registerSW } from 'virtual:pwa-register'
import ActionToastViewport from './components/common/ActionToastViewport.jsx'

const portalMode =
  import.meta.env.VITE_PORTAL_MODE || import.meta.env.MODE
const isStaffRoute =
  window.location.pathname === '/login/staff' ||
  window.location.pathname === '/staff' ||
  window.location.pathname.startsWith('/staff/')
const loadApp =
  portalMode === 'staff' || isStaffRoute
    ? import('./staff/StaffApp.jsx')
    : import('./App.jsx')

loadApp.then(({ default: App }) => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <>
        <App />
        <ActionToastViewport />
      </>
    </StrictMode>,
  )
}).catch((error) => {
  console.error('Unable to start the AMCOMS portal:', error)
  createRoot(document.getElementById('root')).render(
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section role="alert" className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-bold text-slate-900">Unable to load the portal</h1>
        <p className="mt-3 text-sm text-slate-600">
          {error instanceof Error ? error.message : 'An unexpected startup error occurred.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white hover:bg-blue-900"
        >
          Reload portal
        </button>
      </section>
    </main>,
  )
})

registerSW()
