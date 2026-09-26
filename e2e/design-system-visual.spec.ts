import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import {
  installUiBoot,
  assertParishRecordEditorLayout,
  matrixViewports,
  openParishRecordEditor,
  openPublicObservation,
  openProtectedObservation,
  publicDesignRoutes,
  representativeProtectedRoutes,
  setThemeThroughHeader,
  type MatrixTheme,
  type MatrixViewportName,
} from './design-system-matrix'

const scenarios = [
  { name: 'desktop-light', viewportName: 'desktop', theme: 'light' },
  { name: 'desktop-dark', viewportName: 'desktop', theme: 'dark' },
  { name: 'mobile-light', viewportName: 'mobile', theme: 'light' },
  { name: 'mobile-dark', viewportName: 'mobile', theme: 'dark' },
  { name: 'compact-light', viewportName: 'compact', theme: 'light' },
  { name: 'compact-dark', viewportName: 'compact', theme: 'dark' },
] as const

async function captureLayoutEvidence(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' })
}

async function assertViewportContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#main-content, main.auth-page, main:has(#gioi-thieu-tieu-de)')
    return ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      mainClientWidth: main?.clientWidth ?? 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
      focusRing: getComputedStyle(document.documentElement).getPropertyValue('--color-focus-ring').trim(),
      surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface-app').trim(),
    })
  })

  expect(layout.documentWidth, 'document must not overflow the visual viewport').toBeLessThanOrEqual(layout.viewportWidth + 1)
  expect(layout.bodyWidth, 'body must not overflow the visual viewport').toBeLessThanOrEqual(layout.viewportWidth + 1)
  expect(layout.mainClientWidth, 'main landmark must have a measurable width').toBeGreaterThan(0)
  expect(layout.mainScrollWidth, 'main content must contain horizontal overflow inside its own data scrollers').toBeLessThanOrEqual(layout.mainClientWidth + 1)
  expect(layout.focusRing).not.toBe('')
  expect(layout.surface).not.toBe('')
}

test.describe('Design System visual layout matrix', () => {
  test.describe.configure({ timeout: 240_000 })

  test('protected route matrix', async ({ page }, testInfo) => {
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')

    for (const scenario of scenarios) {
      await setThemeThroughHeader(page, scenario.theme as MatrixTheme)
      for (const route of representativeProtectedRoutes) {
        await openProtectedObservation(
          page,
          route,
          scenario.viewportName as MatrixViewportName,
          scenario.name,
        )

        await captureLayoutEvidence(page, testInfo, `${route.slice(1)}-${scenario.name}`)

        await assertViewportContainment(page)
        if (route === '/parish-profile') {
          const dialog = await openParishRecordEditor(page)
          await assertParishRecordEditorLayout(page)
          await captureLayoutEvidence(page, testInfo, `parish-profile-record-editor-${scenario.name}`)
          await dialog.getByRole('button', { name: 'Đóng' }).click()
        }
        if (scenario.viewportName !== 'desktop') {
          const pageHeader = page.locator('.page-header').first()
          if (await pageHeader.count() && await pageHeader.isVisible()) {
            const box = await pageHeader.boundingBox()
            expect(
              box?.height ?? Number.POSITIVE_INFINITY,
              'responsive page header must not retain its desktop flex-basis as vertical whitespace',
            ).toBeLessThanOrEqual(matrixViewports[scenario.viewportName].height / 2)
          }
        }
      }
    }
  })

  for (const scenario of scenarios) {
    test(`public routes · ${scenario.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize(matrixViewports[scenario.viewportName])
      await installUiBoot(page, scenario.theme as MatrixTheme)

      for (const publicRoute of publicDesignRoutes) {
        await openPublicObservation(page, publicRoute, scenario.name)
        await captureLayoutEvidence(page, testInfo, `${publicRoute.artifact}-${scenario.name}`)
        await assertViewportContainment(page)

        if (publicRoute.route === '/login/phuhuynh') {
          await page.getByRole('button', { name: 'Quên mật khẩu?' }).click()
          await expect(page.getByRole('dialog', { name: 'Khôi Phục Tài Khoản An Toàn' })).toBeVisible()
          await captureLayoutEvidence(page, testInfo, `parent-forgot-password-${scenario.name}`)
          await assertViewportContainment(page)
          await page.getByRole('button', { name: 'Đóng' }).click()
        }
      }
    })
  }

  test('mobile bottom navigation reaches every primary staff workspace', async ({ page }) => {
    await page.setViewportSize(matrixViewports.mobile)
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')

    const destinations = [
      { label: 'Điểm danh', route: '/attendance' },
      { label: 'Bảng điểm', route: '/grades' },
      { label: 'Thiếu nhi', route: '/students' },
      { label: 'Báo cáo', route: '/reports' },
      { label: 'Trang chủ', route: '/dashboard' },
    ] as const

    for (const destination of destinations) {
      const item = page.locator('.mobile-bottom-nav').getByRole('button', { name: destination.label })
      await expect(item).toBeVisible()
      await item.click()
      await expect(page).toHaveURL(new RegExp(`${destination.route}$`))
      await expect(item).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('#main-content.mobile-app-main .product-view').first()).toBeVisible({ timeout: 15_000 })
    }
  })
})
