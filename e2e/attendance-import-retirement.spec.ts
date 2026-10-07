import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession } from './helpers'

test('@critical retired TINI endpoints cannot import and attendance stays available on desktop and mobile', async ({ page }) => {
  test.setTimeout(90_000)
  const session = await getAdminSession(page.request)

  const retiredEndpoints = [
    ['GET', '/links'],
    ['GET', '/candidates?year=2026-2027'],
    ['POST', '/preview'],
    ['POST', '/commit'],
    ['POST', '/links'],
    ['POST', '/links/bulk'],
    ['POST', '/links/retired-link/retire'],
  ] as const
  for (const [method, path] of retiredEndpoints) {
    const response = await authorizedRequest(page.request, session, method,
      `/api/tini-attendance-import${path}`, method === 'POST' ? {} : undefined)
    expect(response.status(), `${method} ${path} must be retired`).toBe(404)
  }

  await injectSession(page, session)
  await page.setViewportSize({ width: 1440, height: 900 })
  const bootstrap = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/auth/me'
    && response.request().method() === 'GET'
  ))
  await page.goto('/attendance')
  expect((await bootstrap).status()).toBe(200)
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('#main-content .product-view').first()).toBeVisible()
    await expect(page.getByRole('heading', {
      name: viewport.width > 768 ? 'Điểm Danh & Chuyên Cần' : 'Phiên Điểm Danh', exact: true,
    })).toBeVisible()
    await expect(page.getByRole('tab', {
      name: viewport.width > 768 ? 'Sổ Điểm Danh' : 'Điểm Danh', exact: true,
    })).toBeVisible()
    await expect(page.getByRole('button', { name: /TINI/i })).toHaveCount(0)
    await expect(page.getByLabel('Tệp xuất từ TINI')).toHaveCount(0)
  }
})
