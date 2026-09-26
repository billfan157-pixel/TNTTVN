import { test, expect } from '@playwright/test'
import { loginAsRole } from './helpers'

// CI-root-cause (2026-09-04): file này từng dùng devices['iPhone 13'] (cần
// engine webkit) trong khi CI chỉ cài chromium → browserType.launch fail.
// Mục đích test là viewport/touch mobile, không phải engine Safari — emulate
// mobile trên chromium (390x844 + touch), giữ nguyên hành vi cần kiểm.
test.use({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})

test.describe('Mobile QR Attendance & Attendance Flow E2E', () => {
  test('Catechist can log in, navigate to attendance, and mark mobile attendance', async ({ page }) => {
    await loginAsRole(page, 'chunhiem')
    await page.goto('/attendance')

    const attendanceTab = page.getByRole('tab', { name: 'Điểm Danh' })
    await expect(attendanceTab).toBeVisible({ timeout: 15_000 })
    await expect(attendanceTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Thiếu Nhi E2E', { exact: true })).toBeVisible()
    // Toggle status to guarantee a state change regardless of pre-existing state in shared test DB
    const studentStatus = page.getByRole('group', { name: /Trạng thái của/ })
    const presentBtn = studentStatus.getByRole('button', { name: /Có mặt:/ })
    const isPresent = (await presentBtn.getAttribute('aria-pressed')) === 'true'
    if (isPresent) {
      await studentStatus.getByRole('button', { name: /Vắng có phép:/ }).click()
    } else {
      await presentBtn.click()
    }
    await expect(page.getByRole('button', { name: 'Lưu điểm danh' })).toBeEnabled()
    await page.getByRole('button', { name: 'Lưu điểm danh' }).click()
    await expect(page.getByText('Đã lưu điểm danh cho 1 thiếu nhi.')).toBeVisible({ timeout: 5000 })
  })
})
