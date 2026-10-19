import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey, waitForBootstrapBaseline } from './helpers'

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
      const session = await getAdminSession(page.request)
      // Shared seed classes have attendance after other journeys. Own the
      // empty-history precondition on every browser, retry and repeat.
      const key = `${testKey(testInfo, 'NEUTRAL')}-${testInfo.repeatEachIndex}`
      const createdClass = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
        code: key, name: `Lớp ${key}`, branchId: 'AuNhi', academicYearId: '2026-2027',
      })
      expect(createdClass.status()).toBe(201)
      const { id: classId } = (await createdClass.json()).data
      const fullName = `Chưa điểm danh ${key}`
      const createdStudent = await authorizedRequest(page.request, session, 'POST', '/api/students', {
        fullName, holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2016-02-02', branch: 'AuNhi', classId,
      })
      expect(createdStudent.status()).toBe(201)
      const { id: studentId } = (await createdStudent.json()).data
      const attendance = await authorizedRequest(page.request, session, 'GET', `/api/attendance?studentId=${studentId}`)
      expect(attendance.status()).toBe(200)
      expect((await attendance.json()).data).toEqual([])
      await injectSession(page, session)
      // Enter the fixture's class scope before opening history. Changing the
      // class filter navigates/remounts this route and can close a new modal.
      await page.goto(`/attendance?tab=summary&classId=${classId}`)
      await waitForBootstrapBaseline(page)
      if (mobile) await page.getByRole('tab', { name: 'Tổng Hợp', exact: true }).click()
      const summary = page.getByRole('tabpanel', { name: /Tổng Hợp/ })
      await expect(summary.getByRole('combobox', {
        name: mobile ? 'Chọn lớp xem tổng hợp chuyên cần' : 'Lớp cần xem thống kê chuyên cần',
      })).toHaveValue(classId)
      await expect(summary.getByText('Chưa có buổi được ghi nhận', { exact: true }).first()).toBeVisible()
      await expect(summary.getByText('100%', { exact: true })).toHaveCount(0)
      await expect(summary.getByText('Đều đạt chuẩn', { exact: true })).toHaveCount(0)
      if (mobile) {
        await summary.getByRole('button', { name: `Xem lịch sử điểm danh của Giuse ${fullName}`, exact: true }).click()
      } else {
        await summary.getByRole('row').filter({ hasText: fullName }).getByRole('button', { name: 'Chi tiết' }).click()
      }
      const history = page.getByRole('dialog', { name: `Giuse ${fullName}`, exact: true })
      await expect(history).toBeVisible()
      await expect(history.getByText(/Chưa có điểm danh/)).toBeVisible()
      await expect(history.getByText(/100%/)).toHaveCount(0)
      await testInfo.attach(`unrecorded-attendance-${layout}.png`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })
  }
})
