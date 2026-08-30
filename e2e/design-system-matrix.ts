import { expect, type Page } from '@playwright/test'

export type MatrixTheme = 'light' | 'dark'
export type MatrixViewportName = 'desktop' | 'mobile' | 'compact'

export const matrixViewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  compact: { width: 320, height: 720 },
} as const

export const representativeProtectedRoutes = [
  '/dashboard',
  '/students',
  '/attendance',
  '/grades',
  '/finances',
] as const

export type RepresentativeProtectedRoute = (typeof representativeProtectedRoutes)[number]

export const publicDesignRoutes = [
  { route: '/login', artifact: 'portal-chooser', readySelector: '.auth-option' },
  { route: '/login/nhan-su', artifact: 'staff-login', readySelector: '#staff-username' },
  { route: '/login/phuhuynh', artifact: 'parent-login', readySelector: '#parent-phone' },
  {
    route: '/verify',
    artifact: 'verification',
    readySelector: 'main.auth-page h3',
    readyText: 'Thiếu tham số quét QR',
  },
] as const

export type PublicDesignRoute = (typeof publicDesignRoutes)[number]

const desktopNavLabels: Record<RepresentativeProtectedRoute, string> = {
  '/dashboard': 'Tổng Quan',
  '/students': 'Thiếu Nhi',
  '/attendance': 'Điểm Danh',
  '/grades': 'Bảng Điểm',
  '/finances': 'Quỹ & Thu Chi',
}

export async function installUiBoot(page: Page, theme: MatrixTheme = 'light') {
  await page.addInitScript(selectedTheme => {
    localStorage.setItem('parish_ui_boot', JSON.stringify({ theme: selectedTheme, viewMode: 'auto' }))
  }, theme)
}

export async function setThemeThroughHeader(page: Page, theme: MatrixTheme) {
  await page.setViewportSize(matrixViewports.desktop)
  const toggle = page.getByRole('button', { name: 'Đổi giao diện sáng/tối' })
  await expect(toggle).toBeVisible({ timeout: 15_000 })
  const desiredPressed = String(theme === 'dark')
  if (await toggle.getAttribute('aria-pressed') !== desiredPressed) {
    await toggle.click()
  }
  await expect(toggle).toHaveAttribute('aria-pressed', desiredPressed)
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

/**
 * Navigate through the real desktop sidebar, then resize for the observation.
 * Keeping one SPA document avoids manufacturing refresh-token rotation races by
 * reloading the authenticated app twenty times inside a single matrix.
 */
export async function openProtectedObservation(
  page: Page,
  route: RepresentativeProtectedRoute,
  viewportName: MatrixViewportName,
  observationName: string,
) {
  await page.setViewportSize(matrixViewports.desktop)
  const navItem = page.locator('.sidebar-nav-item', { hasText: desktopNavLabels[route] }).first()
  if (new URL(page.url()).pathname !== route) {
    await expect(navItem, `${route} must be reachable from the admin sidebar`).toBeVisible({ timeout: 15_000 })
    await navItem.click()
  }
  await expect(page, `${route} must resolve to its canonical route`).toHaveURL(new RegExp(`${route}$`))
  await expect(navItem, `${route} must be the active desktop destination`).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize(matrixViewports[viewportName])
  const main = page.locator('#main-content')
  await expect(main, `${route} must expose the shared main landmark for ${observationName}`).toBeVisible({ timeout: 15_000 })
  await expect(main).toHaveClass(viewportName === 'desktop' ? /app-main-content/ : /mobile-app-main/)
  await expect(
    main.locator('.product-view').first(),
    `${route} must finish its lazy route render before ${observationName}`,
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    main.locator('[role="status"][aria-label^="Đang tải"]'),
    `${route} must finish loading its primary data before ${observationName}`,
  ).toHaveCount(0, { timeout: 15_000 })
  return main
}

export async function openPublicObservation(
  page: Page,
  observation: PublicDesignRoute,
  observationName: string,
) {
  await page.goto(observation.route)
  const main = page.locator('main.auth-page')
  await expect(main, `${observation.route} must render the public auth shell for ${observationName}`).toBeVisible({ timeout: 15_000 })
  const ready = page.locator(observation.readySelector).first()
  await expect(ready, `${observation.route} must finish rendering for ${observationName}`).toBeVisible({ timeout: 15_000 })
  if ('readyText' in observation) {
    await expect(ready).toHaveText(observation.readyText)
  }
  return main
}
