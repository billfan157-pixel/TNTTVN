const INTER_STYLESHEET_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'

/**
 * Loads the Inter stylesheet without blocking first paint — and without any
 * inline `onload` handler (production CSP sets `script-src-attr 'none'`, so
 * `onload="..."` attributes are blocked; programmatic listeners are fine).
 *
 * Fire-and-forget: first paint renders with the system-ui fallback, then
 * swaps to Inter once fetched. A timeout fallback applies the sheet even if
 * the load event never fires.
 */
export function loadInterFontAsync(timeoutMs = 3000): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('link[data-inter-font]')) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.setAttribute('as', 'style')
  link.href = INTER_STYLESHEET_HREF
  link.setAttribute('data-inter-font', 'true')
  const apply = () => {
    link.rel = 'stylesheet'
  }
  link.addEventListener('load', apply, { once: true })
  setTimeout(apply, timeoutMs)
  document.head.appendChild(link)
}
