import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ToastContainer } from './components/common/ToastContainer'
import { initSentry } from './lib/sentry'
import { initDB } from './lib/db'
import { loadTokens } from './lib/api'
import { registerServiceWorkerOnly } from './lib/pushManager'
import { installNativeMediaDevicesGuard } from './lib/nativeMediaGuard'
import { BiometricLockGate } from './components/auth/BiometricLockGate'
import { installAppLockLifecycle } from './stores/appLockStore'
import { useAuthStore } from './stores/authStore'
import './index.css'

installNativeMediaDevicesGuard()
installAppLockLifecycle().catch(console.warn)
initSentry()
// Start native legacy-worker cleanup before auth bootstrap/render. This remains
// non-blocking so a slow browser storage API cannot cause a white screen.
registerServiceWorkerOnly().catch(console.warn)
loadTokens()
useAuthStore.getState().loadFromStorage()

// Render immediately to prevent any white screen if IndexedDB / WebCrypto hangs or blocks
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BiometricLockGate>
        <RouterProvider router={router} />
      </BiometricLockGate>
      <ToastContainer />
    </ErrorBoundary>
  </StrictMode>,
)

initDB().catch((err) => {
  console.warn('Background database initialization warning (running in fallback mode):', err)
})
