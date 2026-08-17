import type { Plugin } from 'vite'

let debounceTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Temporary workaround for @tailwindcss/vite HMR issue.
 *
 * When a .tsx file changes, Tailwind's hotUpdate may return early
 * without invalidating CSS modules, so new/removed utility classes
 * are not reflected in the served CSS until the dev server is restarted.
 *
 * This plugin forces a full page reload whenever a TS/JS source file
 * changes, ensuring the browser re-requests fresh CSS from the server.
 * The debounce prevents multiple reloads within 100ms.
 *
 * Trade-off: React Fast Refresh state is not preserved across reloads.
 *
 * TODO: Remove when @tailwindcss/vite no longer requires this workaround.
 */
export function tailwindHmrFix(): Plugin {
  return {
    name: 'tailwind-hmr-fix',
    enforce: 'pre',
    hotUpdate({ file, server }) {
      if (!/\.[cm]?[jt]sx?$/.test(file)) return

      const clientEnv = server.environments?.client
      if (!clientEnv) return

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        clientEnv.hot.send({ type: 'full-reload' })
      }, 100)
    },
  }
}
