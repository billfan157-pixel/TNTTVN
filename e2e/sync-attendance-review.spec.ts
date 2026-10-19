import { expect, test } from '@playwright/test'
import { getAdminSession, injectSession, waitForBootstrapBaseline } from './helpers'

test.describe('Sync and attendance review regressions', () => {
  test.describe.configure({ timeout: 60_000 })

  for (const mobile of [false, true]) {
    const layout = mobile ? 'mobile' : 'desktop'

    test(`@critical ${layout} retry button starts a real sync after a generation probe outage`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
      await injectSession(page, await getAdminSession(page.request))
      await page.route('**/api/system/purge-version', route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
      }))
      await page.goto('/dashboard')
      const banner = page.locator('.offline-status-banner--failed')
      await expect(banner).toBeVisible()
      await page.unroute('**/api/system/purge-version')
      const verified = page.waitForResponse(response =>
        new URL(response.url()).pathname === '/api/system/purge-version' && response.status() === 200,
      )
      await banner.getByRole('button', { name: 'Thử lại', exact: true }).click()
      await verified
      await waitForBootstrapBaseline(page)
      await expect(banner).toBeHidden()
      await expect(page.locator('.offline-status-banner--syncing')).toBeHidden()
    })

    test(`@critical ${layout} attendance summary and student history keep unrecorded attendance neutral`, async ({ page }, testInfo) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
      await injectSession(page, await getAdminSession(page.request))
      await page.goto('/attendance?tab=summary')
      await waitForBootstrapBaseline(page)
      if (mobile) await page.getByRole('tab', { name: 'Tổng Hợp', exact: true }).click()
      const summary = page.getByRole('tabpanel', { name: /Tổng Hợp/ })
      await summary.getByRole('combobox', {
        name: mobile ? 'Chọn lớp xem tổng hợp chuyên cần' : 'Lớp cần xem thống kê chuyên cần',
      }).selectOption('CLS-AN-1')
      await expect(summary.getByText('Chưa có buổi được ghi nhận', { exact: true }).first()).toBeVisible()
      await expect(summary.getByText('100%', { exact: true })).toHaveCount(0)
      await expect(summary.getByText('Đều đạt chuẩn', { exact: true })).toHaveCount(0)
      if (mobile) {
        await summary.getByRole('button', { name: 'Xem lịch sử điểm danh của Giuse Thiếu Nhi E2E Khác' }).click()
      } else {
        await summary.getByRole('row').filter({ hasText: 'Thiếu Nhi E2E Khác' }).getByRole('button', { name: 'Chi tiết' }).click()
      }
      const history = page.getByRole('dialog', { name: 'Giuse Thiếu Nhi E2E Khác', exact: true })
      await expect(history).toBeVisible()
      await expect(history.getByText(/Chưa có điểm danh/)).toBeVisible()
      await expect(history.getByText(/100%/)).toHaveCount(0)
      await testInfo.attach(`unrecorded-attendance-${layout}.png`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })
  }
})
