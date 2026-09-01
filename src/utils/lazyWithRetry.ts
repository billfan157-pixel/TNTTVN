import { createElement, type ComponentType } from 'react'

export type PreloadableComponent<T extends ComponentType<any>> = T & {
  preload: () => Promise<void>
}

/**
 * lazyWithRetry — Bọc lazy() để tự động thử lại khi tải module bất đồng bộ bị gián đoạn mạng hoặc stale chunk do deploy/Vite HMR.
 * Sau số lần retry, lỗi được chuyển cho ErrorBoundary để người dùng chủ động tải
 * lại. Background route preload tuyệt đối không được tự reload ứng dụng.
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
            if (remaining > 0) {
              setTimeout(() => {
                attempt(remaining - 1)
              }, interval)
            } else {
              reject(error)
            }
          })
      }
      attempt(retries)
    })

    const currentPromise = loadPromise
    void currentPromise.catch(() => {
      // A failed idle preload must not poison this component forever. A later
      // explicit navigation gets a fresh retry sequence and ErrorBoundary UX.
      if (loadPromise === currentPromise) loadPromise = undefined
    })
    return currentPromise
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
