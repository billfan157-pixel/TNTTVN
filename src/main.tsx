import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { initSentry } from './lib/sentry'
import { initDB } from './lib/db'
import './index.css'

initSentry()
initDB()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
)
