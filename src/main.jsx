
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { registerSW } from 'virtual:pwa-register'
import ActionToastViewport from './components/common/ActionToastViewport.jsx'

const portalMode =
  import.meta.env.VITE_PORTAL_MODE || import.meta.env.MODE
const loadApp =
  portalMode === 'staff'
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
})

registerSW()
