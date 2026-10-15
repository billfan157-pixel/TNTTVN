import { createElement, type ComponentType } from 'react'
import type { PreloadableComponent } from '../../utils/lazyWithRetry'
import { PageSuspense } from './RootLayout'

/** Keep chunk readiness visible to the router through the page error/suspense boundary. */
export function suspensePage(Page: PreloadableComponent<ComponentType>) {
  return Object.assign(() => createElement(PageSuspense, null, createElement(Page)), {
    // A failed speculative import must not leave Router's cached component
    // promise rejected forever. Rendering retries through lazyWithRetry and
    // keeps the existing PageSuspense/ErrorBoundary recovery UI.
    preload: () => Page.preload().catch(() => {}),
  })
}
