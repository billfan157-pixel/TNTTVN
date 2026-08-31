import { createElement, type ComponentType } from 'react'

export type PreloadableComponent<T extends ComponentType<any>> = T & {
  preload: () => Promise<void>
}

/**
 * lazyWithRetry — Bọc lazy() để tự động thử lại khi tải module bất đồng bộ bị gián đoạn mạng hoặc stale chunk do deploy/Vite HMR.
 * Nếu sau số lần retry vẫn lỗi và là lỗi chunk/fetch module, tự động reload trang an toàn một lần để làm mới bundle cache.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  exportName = 'default',
  retries = 3,
  interval = 300
): PreloadableComponent<T> {
  let loadedComponent: T | undefined
  let loadPromise: Promise<void> | undefined

  const load = () => {
    if (loadedComponent) return Promise.resolve()
    if (loadPromise) return loadPromise

    loadPromise = new Promise<void>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then((module: any) => {
            const comp = exportName === 'default' ? module.default || module : module[exportName] || module.default || module
            loadedComponent = comp as T
            resolve()
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

    return loadPromise
  }

  // TanStack Router only preloads route components that expose `.preload()`.
  // Rendering the resolved component directly also avoids a second Suspense
  // pass after the router has already awaited the module during navigation.
  const PreloadableLazyComponent = ((props: any) => {
    if (!loadedComponent) throw load()
    return createElement(loadedComponent, props)
  }) as unknown as PreloadableComponent<T>

  PreloadableLazyComponent.preload = load
  return PreloadableLazyComponent
}
