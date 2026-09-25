/** An explicit build mode plus a Workers-only global prevent a Node server
 * from accidentally bypassing its boot-time database checks. */
export function isCloudflareWorkerRuntime(): boolean {
  return process.env.CATEVIA_RUNTIME === 'cloudflare-worker'
    && typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair === 'function'
}
