import { lazy, type ComponentType } from 'react'

/**
 * lazyWithRetry — Bọc lazy() để tự động thử lại khi tải module bất đồng bộ bị gián đoạn mạng hoặc stale chunk do deploy/Vite HMR.
 * Nếu sau số lần retry vẫn lỗi và là lỗi chunk/fetch module, tự động reload trang an toàn một lần để làm mới bundle cache.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  exportName = 'default',
  retries = 3,
  interval = 300
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then((module: any) => {
            const comp = exportName === 'default' ? module.default || module : module[exportName] || module.default || module
            resolve({ default: comp })
          })
          .catch((error) => {
            const msg = String(error?.message || error || '')
            const isFetchOrChunkError =
              msg.includes('Failed to fetch dynamically imported module') ||
              msg.includes('Outdated Optimize Dep') ||
              msg.includes('504') ||
              msg.includes('Failed to load resource') ||
              error?.name === 'ChunkLoadError' ||
              msg.includes('Loading chunk') ||
              msg.includes('Importing a module script failed') ||
              msg.includes('error loading dynamically imported module')

            if (remaining > 0) {
              setTimeout(() => {
                attempt(remaining - 1)
              }, interval)
            } else if (isFetchOrChunkError && typeof window !== 'undefined') {
              // Phòng chống reload loop: chỉ reload 1 lần trong 15 giây
              const reloadKey = 'tntt_last_chunk_reload_time'
              const lastReload = sessionStorage.getItem(reloadKey)
              const now = Date.now()
              if (!lastReload || now - Number(lastReload) > 15000) {
                sessionStorage.setItem(reloadKey, String(now))
                window.location.reload()
                return
              }
              reject(error)
            } else {
              reject(error)
            }
          })
      }
      attempt(retries)
    })
  )
}
