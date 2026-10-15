/** Mobile/tablet use the lightweight content fade, matching useEffectiveMode's floor. */
export function supportsNativeRouteMotion(): boolean {
  return typeof window !== 'undefined'
    && window.innerWidth >= 1024
    && typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
}
