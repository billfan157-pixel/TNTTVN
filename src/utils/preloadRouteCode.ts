import type { AnyRouter } from '@tanstack/react-router'

/** Warm UI code without racing navigation's pending/cached route matches. */
export async function preloadRouteCode(router: AnyRouter, path: string): Promise<void> {
  await router.routesByPath[path]?.options.component?.preload?.()
}
