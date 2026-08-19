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
import { useClassStore } from './stores/classStore'
import { useSettingsStore } from './stores/settingsStore'
import { useAcademicYearStore } from './stores/academicYearStore'
import { useAuthStore } from './stores/authStore'
import './index.css'

installNativeMediaDevicesGuard()
initSentry()
loadTokens()
useAuthStore.getState().loadFromStorage()

registerServiceWorkerOnly().catch(console.warn)

// Render immediately to prevent any white screen if IndexedDB / WebCrypto hangs or blocks
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
      <ToastContainer />
    </ErrorBoundary>
  </StrictMode>,
)

// Initialize stores and offline database in the background
setTimeout(() => {
  useClassStore.getState().fetchAll()
  useSettingsStore.getState().fetchSettings()
  useAcademicYearStore.getState().fetchAcademicYears()
}, 0)

initDB().catch((err) => {
  console.warn('Background database initialization warning (running in fallback mode):', err)
})
