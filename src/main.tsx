// TNTTVN v2.5.0
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { initSentry } from './lib/sentry'
import { initDB } from './lib/db'
import { loadTokens } from './lib/api'
import './index.css'

initSentry()
loadTokens()

// Ensure IndexedDB is fully initialized before rendering React tree
initDB().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>,
  )
}).catch((err) => {
  console.error('Failed to initialize database:', err)
  // Render anyway with degraded offline support
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>,
  )
})
